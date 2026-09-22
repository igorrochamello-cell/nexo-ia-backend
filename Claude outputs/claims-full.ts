import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '@/db/client';
import { claims, policies } from '@/db/schema';
import { authMiddleware, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errors';
import { logAction } from '@/utils/audit';
import { eq, and, isNull, like, desc, asc, sql } from 'drizzle-orm';

const router = Router();
router.use(authMiddleware);

const CreateClaimSchema = z.object({
  policyId: z.string().uuid('Invalid policy ID'),
  clientId: z.string().uuid('Invalid client ID'),
  numeroSinistro: z.string().min(1, 'Claim number required').max(100),
  status: z.enum(['aberto', 'em_analise', 'aprovado', 'negado', 'pago', 'cancelado']).default('aberto'),
  dataSinistro: z.string().date('Invalid date format'),
  dataComunicacao: z.string().date('Invalid date format').optional(),
  descricao: z.string().max(2000).optional(),
  valorIndenizacao: z.number().positive('Amount must be positive').optional(),
  valorPago: z.number().min(0).default(0),
  dataPagamento: z.string().date('Invalid date format').optional(),
  responsavelId: z.string().uuid().optional(),
});

const UpdateClaimSchema = CreateClaimSchema.partial();

const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  policyId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  status: z.enum(['aberto', 'em_analise', 'aprovado', 'negado', 'pago', 'cancelado']).optional(),
  sortBy: z.enum(['numeroSinistro', 'dataSinistro', 'valorIndenizacao', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// GET /claims - List all claims for company
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const query = ListQuerySchema.parse(req.query);
    const { companyId } = req.context!;
    const offset = (query.page - 1) * query.limit;

    const whereConditions = [
      eq(claims.companyId, companyId),
      isNull(claims.deletedAt),
    ];

    if (query.q) {
      whereConditions.push(like(claims.numeroSinistro, `%${query.q}%`));
    }
    if (query.policyId) {
      whereConditions.push(eq(claims.policyId, query.policyId));
    }
    if (query.clientId) {
      whereConditions.push(eq(claims.clientId, query.clientId));
    }
    if (query.status) {
      whereConditions.push(eq(claims.status, query.status));
    }

    let sortColumn: any = claims.createdAt;
    if (query.sortBy === 'numeroSinistro') sortColumn = claims.numeroSinistro;
    else if (query.sortBy === 'dataSinistro') sortColumn = claims.dataSinistro;
    else if (query.sortBy === 'valorIndenizacao') sortColumn = claims.valorIndenizacao;

    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(claims)
      .where(and(...whereConditions));
    const total = Number(countResult[0]?.count || 0);

    const data = await db
      .select()
      .from(claims)
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

// POST /claims - Create new claim
router.post(
  '/',
  requirePermission('can_create_claims'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = CreateClaimSchema.parse(req.body);
    const { companyId, userId } = req.context!;

    // Verify policy belongs to company
    const policy = await db
      .select()
      .from(policies)
      .where(and(eq(policies.id, input.policyId), eq(policies.companyId, companyId)))
      .limit(1);

    if (!policy.length) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Check for duplicate claim number
    const existing = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.companyId, companyId),
          eq(claims.numeroSinistro, input.numeroSinistro)
        )
      )
      .limit(1);

    if (existing.length) {
      return res.status(400).json({ error: 'Claim number already exists' });
    }

    const newClaim = await db
      .insert(claims)
      .values({
        companyId,
        ...input,
      })
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'CREATE',
      resourceType: 'claims',
      resourceId: newClaim[0].id,
      valueBefore: null,
      valueAfter: JSON.stringify(newClaim[0]),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.status(201).json(newClaim[0]);
  })
);

// GET /claims/:id - Get single claim
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId } = req.context!;

    const claim = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, id), eq(claims.companyId, companyId), isNull(claims.deletedAt)))
      .limit(1);

    if (!claim.length) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    res.json(claim[0]);
  })
);

// PUT /claims/:id - Update claim
router.put(
  '/:id',
  requirePermission('can_edit_claims'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const input = UpdateClaimSchema.parse(req.body);
    const { companyId, userId } = req.context!;

    const existingClaim = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, id), eq(claims.companyId, companyId), isNull(claims.deletedAt)))
      .limit(1);

    if (!existingClaim.length) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const before = existingClaim[0];

    const updated = await db
      .update(claims)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, id))
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'UPDATE',
      resourceType: 'claims',
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

// DELETE /claims/:id - Soft delete claim
router.delete(
  '/:id',
  requirePermission('can_delete_claims'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId, userId } = req.context!;

    const existingClaim = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, id), eq(claims.companyId, companyId), isNull(claims.deletedAt)))
      .limit(1);

    if (!existingClaim.length) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const before = existingClaim[0];

    const deleted = await db
      .update(claims)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(claims.id, id))
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'DELETE',
      resourceType: 'claims',
      resourceId: id,
      valueBefore: JSON.stringify(before),
      valueAfter: null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.json({ message: 'Claim deleted successfully' });
  })
);

export default router;
