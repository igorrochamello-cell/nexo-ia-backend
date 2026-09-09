import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireCompanyContext } from '../auth/middleware';
import { db } from '../db/client';
import { deals } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export const dealsRouter = Router();

dealsRouter.use(requireAuth, requireCompanyContext);

const createDealSchema = z.object({
  clientId: z.string().uuid(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  corretorId: z.string().uuid(),
  ramo: z.string(),
  seguradora: z.string().optional(),
  valorEstimado: z.number().optional(),
  status: z.enum(['aberto', 'ganho', 'perdido', 'congelado']).optional(),
});

// GET /api/deals - Listar negócios
dealsRouter.get('/', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const result = await db
      .select()
      .from(deals)
      .where(eq(deals.companyId, companyId));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar negócios' });
  }
});

// GET /api/deals/:id - Obter negócio específico
dealsRouter.get('/:id', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const result = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.companyId, companyId),
          eq(deals.id, req.params.id),
        ),
      )
      .limit(1);

    if (!result.length) {
      res.status(404).json({ error: 'Negócio não encontrado' });
      return;
    }
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar negócio' });
  }
});

// POST /api/deals - Criar novo negócio
dealsRouter.post('/', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const parsed = createDealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.errors });
      return;
    }

    const dealId = crypto.randomUUID();
    const now = new Date();

    await db.insert(deals).values({
      id: dealId,
      companyId: companyId,
      clientId: parsed.data.clientId,
      pipelineId: parsed.data.pipelineId,
      stageId: parsed.data.stageId,
      corretorId: parsed.data.corretorId,
      ramo: parsed.data.ramo,
      seguradora: parsed.data.seguradora ?? null,
      valorEstimado: String(parsed.data.valorEstimado ?? 0),
      status: (parsed.data.status ?? 'aberto') as any,
      stageChangedAt: now,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(deals)
      .where(eq(deals.id, dealId))
      .limit(1);

    res.status(201).json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar negócio' });
  }
});

// PUT /api/deals/:id - Atualizar negócio (incluindo mover de stage)
dealsRouter.put('/:id', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const parsed = createDealSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos' });
      return;
    }

    // Verificar se deal existe e pertence a esta empresa
    const existing = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.companyId, companyId),
          eq(deals.id, req.params.id),
        ),
      )
      .limit(1);

    if (!existing.length) {
      res.status(404).json({ error: 'Negócio não encontrado' });
      return;
    }

    const updateData: Record<string, any> = {};

    if (parsed.data.clientId !== undefined) updateData.clientId = parsed.data.clientId;
    if (parsed.data.pipelineId !== undefined) updateData.pipelineId = parsed.data.pipelineId;
    if (parsed.data.stageId !== undefined) updateData.stageId = parsed.data.stageId;
    if (parsed.data.corretorId !== undefined) updateData.corretorId = parsed.data.corretorId;
    if (parsed.data.ramo !== undefined) updateData.ramo = parsed.data.ramo;
    if (parsed.data.seguradora !== undefined) updateData.seguradora = parsed.data.seguradora;
    if (parsed.data.valorEstimado !== undefined) updateData.valorEstimado = String(parsed.data.valorEstimado);
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    if (Object.keys(updateData).length > 0) {
      updateData.stageChangedAt = new Date();
      await db
        .update(deals)
        .set(updateData)
        .where(
          and(
            eq(deals.companyId, companyId),
            eq(deals.id, req.params.id),
          ),
        );
    }

    const updated = await db
      .select()
      .from(deals)
      .where(eq(deals.id, req.params.id))
      .limit(1);

    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar negócio' });
  }
});
