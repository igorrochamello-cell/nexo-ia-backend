import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '@/db/client';
import { deals, pipelines, pipelineStages } from '@/db/schema';
import { authMiddleware, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errors';
import { logAction } from '@/utils/audit';
import { eq, and, isNull, like, desc, asc, sql } from 'drizzle-orm';

const router = Router();
router.use(authMiddleware);

// Schema Validations
const CreateDealSchema = z.object({
  pipelineId: z.string().uuid('Invalid pipeline ID'),
  stageId: z.string().uuid('Invalid stage ID'),
  clientId: z.string().uuid('Invalid client ID'),
  titulo: z.string().min(1, 'Title required').max(255),
  descricao: z.string().max(2000).optional(),
  valor: z.number().positive('Value must be positive').optional(),
  probabilidade: z.number().min(0).max(100, 'Probability between 0-100').optional(),
  data_fechamento_prevista: z.string().date('Invalid date format').optional(),
  responsavelId: z.string().uuid('Invalid responsible user ID').optional(),
});

const UpdateDealSchema = CreateDealSchema.partial();

const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  status: z.enum(['aberto', 'ganho', 'perdido', 'arquivado']).optional(),
  sortBy: z.enum(['titulo', 'valor', 'data_fechamento_prevista', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// GET /deals - List all deals for company with pagination
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const query = ListQuerySchema.parse(req.query);
    const { companyId } = req.context!;
    const offset = (query.page - 1) * query.limit;

    // Build WHERE clause
    const whereConditions = [
      eq(deals.companyId, companyId),
      isNull(deals.deletedAt),
    ];

    if (query.q) {
      whereConditions.push(like(deals.titulo, `%${query.q}%`));
    }
    if (query.pipelineId) {
      whereConditions.push(eq(deals.pipelineId, query.pipelineId));
    }
    if (query.stageId) {
      whereConditions.push(eq(deals.stageId, query.stageId));
    }
    if (query.status) {
      whereConditions.push(eq(deals.status, query.status));
    }

    // Determine sort column
    let sortColumn: any = deals.createdAt;
    if (query.sortBy === 'titulo') sortColumn = deals.titulo;
    else if (query.sortBy === 'valor') sortColumn = deals.valor;
    else if (query.sortBy === 'data_fechamento_prevista') sortColumn = deals.dataFechamentoPrevista;

    // Get total count
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(deals)
      .where(and(...whereConditions));
    const total = Number(countResult[0]?.count || 0);

    // Get paginated results
    const data = await db
      .select()
      .from(deals)
      .where(and(...whereConditions))
      .orderBy(query.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))
      .limit(query.limit)
      .offset(offset);

    res.json({
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  })
);

// POST /deals - Create new deal
router.post(
  '/',
  requirePermission('can_create_deals'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = CreateDealSchema.parse(req.body);
    const { companyId, userId } = req.context!;

    // Verify pipeline belongs to company
    const pipeline = await db
      .select()
      .from(pipelines)
      .where(and(eq(pipelines.id, input.pipelineId), eq(pipelines.companyId, companyId)))
      .limit(1);

    if (!pipeline.length) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    // Verify stage belongs to pipeline
    const stage = await db
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.id, input.stageId), eq(pipelineStages.pipelineId, input.pipelineId)))
      .limit(1);

    if (!stage.length) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const newDeal = await db
      .insert(deals)
      .values({
        companyId,
        ...input,
        criadoPorId: userId,
      })
      .returning();

    // Log audit
    await logAction({
      companyId,
      userId,
      action: 'CREATE',
      resourceType: 'deals',
      resourceId: newDeal[0].id,
      valueBefore: null,
      valueAfter: JSON.stringify(newDeal[0]),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.status(201).json(newDeal[0]);
  })
);

// GET /deals/:id - Get single deal
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId } = req.context!;

    const deal = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.companyId, companyId), isNull(deals.deletedAt)))
      .limit(1);

    if (!deal.length) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(deal[0]);
  })
);

// PUT /deals/:id - Update deal
router.put(
  '/:id',
  requirePermission('can_edit_deals'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const input = UpdateDealSchema.parse(req.body);
    const { companyId, userId } = req.context!;

    // Get existing deal
    const existingDeal = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.companyId, companyId), isNull(deals.deletedAt)))
      .limit(1);

    if (!existingDeal.length) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const before = existingDeal[0];

    // Verify stage belongs to correct pipeline if updating stage
    if (input.stageId) {
      const pipelineId = input.pipelineId || before.pipelineId;
      const stage = await db
        .select()
        .from(pipelineStages)
        .where(and(eq(pipelineStages.id, input.stageId), eq(pipelineStages.pipelineId, pipelineId)))
        .limit(1);

      if (!stage.length) {
        return res.status(400).json({ error: 'Stage does not belong to specified pipeline' });
      }
    }

    const updated = await db
      .update(deals)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id))
      .returning();

    // Log audit with before/after
    await logAction({
      companyId,
      userId,
      action: 'UPDATE',
      resourceType: 'deals',
      resourceId: id,
      valueBefore: JSON.stringify(before),
      valueAfter: JSON.stringify(updated[0]),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.json(updated[0]);
  })
);

// DELETE /deals/:id - Soft delete deal
router.delete(
  '/:id',
  requirePermission('can_delete_deals'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId, userId } = req.context!;

    // Get existing deal
    const existingDeal = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.companyId, companyId), isNull(deals.deletedAt)))
      .limit(1);

    if (!existingDeal.length) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const before = existingDeal[0];

    const deleted = await db
      .update(deals)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(deals.id, id))
      .returning();

    // Log audit
    await logAction({
      companyId,
      userId,
      action: 'DELETE',
      resourceType: 'deals',
      resourceId: id,
      valueBefore: JSON.stringify(before),
      valueAfter: null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.json({ message: 'Deal deleted successfully' });
  })
);

export default router;
