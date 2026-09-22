import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '@/db/client';
import { renewals, policies } from '@/db/schema';
import { authMiddleware, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errors';
import { logAction } from '@/utils/audit';
import { eq, and, isNull, like, desc, asc, sql } from 'drizzle-orm';

const router = Router();
router.use(authMiddleware);

const CreateRenewalSchema = z.object({
  policyId: z.string().uuid('Invalid policy ID'),
  clientId: z.string().uuid('Invalid client ID'),
  numeroRenovacao: z.string().min(1).max(100),
  dataVencimentoOriginal: z.string().date('Invalid date'),
  dataVencimentoNovo: z.string().date('Invalid date'),
  status: z.enum(['pendente', 'em_processo', 'renovada', 'nao_renovada', 'cancelada']).default('pendente'),
  premioAnterior: z.number().positive().optional(),
  premioNovo: z.number().positive().optional(),
  responsavelId: z.string().uuid().optional(),
});

const UpdateRenewalSchema = CreateRenewalSchema.partial();

const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  policyId: z.string().uuid().optional(),
  status: z.enum(['pendente', 'em_processo', 'renovada', 'nao_renovada', 'cancelada']).optional(),
  sortBy: z.enum(['numeroRenovacao', 'dataVencimentoNovo', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const query = ListQuerySchema.parse(req.query);
    const { companyId } = req.context!;
    const offset = (query.page - 1) * query.limit;

    const whereConditions = [
      eq(renewals.companyId, companyId),
      isNull(renewals.deletedAt),
    ];

    if (query.q) {
      whereConditions.push(like(renewals.numeroRenovacao, `%${query.q}%`));
    }
    if (query.policyId) {
      whereConditions.push(eq(renewals.policyId, query.policyId));
    }
    if (query.status) {
      whereConditions.push(eq(renewals.status, query.status));
    }

    let sortColumn: any = renewals.createdAt;
    if (query.sortBy === 'numeroRenovacao') sortColumn = renewals.numeroRenovacao;
    else if (query.sortBy === 'dataVencimentoNovo') sortColumn = renewals.dataVencimentoNovo;

    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(renewals)
      .where(and(...whereConditions));
    const total = Number(countResult[0]?.count || 0);

    const data = await db
      .select()
      .from(renewals)
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

router.post(
  '/',
  requirePermission('can_create_renewals'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = CreateRenewalSchema.parse(req.body);
    const { companyId, userId } = req.context!;

    const policy = await db
      .select()
      .from(policies)
      .where(and(eq(policies.id, input.policyId), eq(policies.companyId, companyId)))
      .limit(1);

    if (!policy.length) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const existing = await db
      .select()
      .from(renewals)
      .where(
        and(
          eq(renewals.companyId, companyId),
          eq(renewals.numeroRenovacao, input.numeroRenovacao)
        )
      )
      .limit(1);

    if (existing.length) {
      return res.status(400).json({ error: 'Renewal number already exists' });
    }

    const newRenewal = await db
      .insert(renewals)
      .values({
        companyId,
        ...input,
      })
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'CREATE',
      resourceType: 'renewals',
      resourceId: newRenewal[0].id,
      valueBefore: null,
      valueAfter: JSON.stringify(newRenewal[0]),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.status(201).json(newRenewal[0]);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId } = req.context!;

    const renewal = await db
      .select()
      .from(renewals)
      .where(and(eq(renewals.id, id), eq(renewals.companyId, companyId), isNull(renewals.deletedAt)))
      .limit(1);

    if (!renewal.length) {
      return res.status(404).json({ error: 'Renewal not found' });
    }

    res.json(renewal[0]);
  })
);

router.put(
  '/:id',
  requirePermission('can_edit_renewals'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const input = UpdateRenewalSchema.parse(req.body);
    const { companyId, userId } = req.context!;

    const existingRenewal = await db
      .select()
      .from(renewals)
      .where(and(eq(renewals.id, id), eq(renewals.companyId, companyId), isNull(renewals.deletedAt)))
      .limit(1);

    if (!existingRenewal.length) {
      return res.status(404).json({ error: 'Renewal not found' });
    }

    const before = existingRenewal[0];

    const updated = await db
      .update(renewals)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(renewals.id, id))
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'UPDATE',
      resourceType: 'renewals',
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

router.delete(
  '/:id',
  requirePermission('can_delete_renewals'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId, userId } = req.context!;

    const existingRenewal = await db
      .select()
      .from(renewals)
      .where(and(eq(renewals.id, id), eq(renewals.companyId, companyId), isNull(renewals.deletedAt)))
      .limit(1);

    if (!existingRenewal.length) {
      return res.status(404).json({ error: 'Renewal not found' });
    }

    const before = existingRenewal[0];

    const deleted = await db
      .update(renewals)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(renewals.id, id))
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'DELETE',
      resourceType: 'renewals',
      resourceId: id,
      valueBefore: JSON.stringify(before),
      valueAfter: null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.json({ message: 'Renewal deleted successfully' });
  })
);

export default router;
