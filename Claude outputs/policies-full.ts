import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '@/db/client';
import { policies, products } from '@/db/schema';
import { authMiddleware, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errors';
import { logAction } from '@/utils/audit';
import { eq, and, isNull, like, desc, asc, sql } from 'drizzle-orm';

const router = Router();
router.use(authMiddleware);

// Schema Validations
const CreatePolicySchema = z.object({
  clientId: z.string().uuid('Invalid client ID'),
  productId: z.string().uuid('Invalid product ID'),
  numeroApolice: z.string().min(1, 'Policy number required').max(100),
  status: z.enum(['ativa', 'vencida', 'cancelada', 'renovada']).default('ativa'),
  vigenciaInicio: z.string().date('Invalid date format'),
  vigenciaFim: z.string().date('Invalid date format'),
  premioTotal: z.number().positive('Premium must be positive').optional(),
  premioPago: z.number().min(0).default(0),
  seguradaPor: z.string().max(255).optional(),
  criadoPorId: z.string().uuid().optional(),
});

const UpdatePolicySchema = CreatePolicySchema.partial();

const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  clientId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  status: z.enum(['ativa', 'vencida', 'cancelada', 'renovada']).optional(),
  sortBy: z.enum(['numeroApolice', 'vigenciaFim', 'premioTotal', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// GET /policies - List all policies for company
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const query = ListQuerySchema.parse(req.query);
    const { companyId } = req.context!;
    const offset = (query.page - 1) * query.limit;

    const whereConditions = [
      eq(policies.companyId, companyId),
      isNull(policies.deletedAt),
    ];

    if (query.q) {
      whereConditions.push(like(policies.numeroApolice, `%${query.q}%`));
    }
    if (query.clientId) {
      whereConditions.push(eq(policies.clientId, query.clientId));
    }
    if (query.productId) {
      whereConditions.push(eq(policies.productId, query.productId));
    }
    if (query.status) {
      whereConditions.push(eq(policies.status, query.status));
    }

    let sortColumn: any = policies.createdAt;
    if (query.sortBy === 'numeroApolice') sortColumn = policies.numeroApolice;
    else if (query.sortBy === 'vigenciaFim') sortColumn = policies.vigenciaFim;
    else if (query.sortBy === 'premioTotal') sortColumn = policies.premioTotal;

    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(policies)
      .where(and(...whereConditions));
    const total = Number(countResult[0]?.count || 0);

    const data = await db
      .select()
      .from(policies)
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

// POST /policies - Create new policy
router.post(
  '/',
  requirePermission('can_create_policies'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = CreatePolicySchema.parse(req.body);
    const { companyId, userId } = req.context!;

    // Verify product belongs to company
    const product = await db
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.companyId, companyId)))
      .limit(1);

    if (!product.length) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check for duplicate policy number
    const existing = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.companyId, companyId),
          eq(policies.numeroApolice, input.numeroApolice)
        )
      )
      .limit(1);

    if (existing.length) {
      return res.status(400).json({ error: 'Policy number already exists' });
    }

    const newPolicy = await db
      .insert(policies)
      .values({
        companyId,
        ...input,
        criadoPorId: userId,
      })
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'CREATE',
      resourceType: 'policies',
      resourceId: newPolicy[0].id,
      valueBefore: null,
      valueAfter: JSON.stringify(newPolicy[0]),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.status(201).json(newPolicy[0]);
  })
);

// GET /policies/:id - Get single policy
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId } = req.context!;

    const policy = await db
      .select()
      .from(policies)
      .where(and(eq(policies.id, id), eq(policies.companyId, companyId), isNull(policies.deletedAt)))
      .limit(1);

    if (!policy.length) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json(policy[0]);
  })
);

// PUT /policies/:id - Update policy
router.put(
  '/:id',
  requirePermission('can_edit_policies'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const input = UpdatePolicySchema.parse(req.body);
    const { companyId, userId } = req.context!;

    const existingPolicy = await db
      .select()
      .from(policies)
      .where(and(eq(policies.id, id), eq(policies.companyId, companyId), isNull(policies.deletedAt)))
      .limit(1);

    if (!existingPolicy.length) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const before = existingPolicy[0];

    // Verify product belongs to company if changing product
    if (input.productId && input.productId !== before.productId) {
      const product = await db
        .select()
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.companyId, companyId)))
        .limit(1);

      if (!product.length) {
        return res.status(404).json({ error: 'Product not found' });
      }
    }

    const updated = await db
      .update(policies)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(policies.id, id))
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'UPDATE',
      resourceType: 'policies',
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

// DELETE /policies/:id - Soft delete policy
router.delete(
  '/:id',
  requirePermission('can_delete_policies'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { companyId, userId } = req.context!;

    const existingPolicy = await db
      .select()
      .from(policies)
      .where(and(eq(policies.id, id), eq(policies.companyId, companyId), isNull(policies.deletedAt)))
      .limit(1);

    if (!existingPolicy.length) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const before = existingPolicy[0];

    const deleted = await db
      .update(policies)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(policies.id, id))
      .returning();

    await logAction({
      companyId,
      userId,
      action: 'DELETE',
      resourceType: 'policies',
      resourceId: id,
      valueBefore: JSON.stringify(before),
      valueAfter: null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success',
    }).catch((err) => console.error('Audit log failed:', err));

    res.json({ message: 'Policy deleted successfully' });
  })
);

export default router;
