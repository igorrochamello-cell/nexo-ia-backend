import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireCompanyContext } from '../auth/middleware';
import { db } from '../db/client';
import { policies } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export const policiesRouter = Router();

policiesRouter.use(requireAuth, requireCompanyContext);

const createPolicySchema = z.object({
  clientId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  ramo: z.string(),
  seguradora: z.string(),
  premioAnual: z.number(),
  vigenciaInicio: z.string(),
  vigenciaFim: z.string(),
  status: z.string().optional(),
  comissaoPercentual: z.number().optional(),
});

// GET /api/policies - Listar apólices
policiesRouter.get('/', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const result = await db
      .select()
      .from(policies)
      .where(eq(policies.companyId, companyId));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar apólices' });
  }
});

// GET /api/policies/:id - Obter apólice específica
policiesRouter.get('/:id', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const result = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.companyId, companyId),
          eq(policies.id, req.params.id),
        ),
      )
      .limit(1);

    if (!result.length) {
      res.status(404).json({ error: 'Apólice não encontrada' });
      return;
    }
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar apólice' });
  }
});

// POST /api/policies - Criar nova apólice
policiesRouter.post('/', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.errors });
      return;
    }

    const policyId = crypto.randomUUID();
    const now = new Date();

    await db.insert(policies).values({
      id: policyId,
      companyId: companyId,
      clientId: parsed.data.clientId,
      dealId: parsed.data.dealId ?? null,
      ramo: parsed.data.ramo,
      seguradora: parsed.data.seguradora,
      premioAnual: String(parsed.data.premioAnual),
      comissaoPercentual: parsed.data.comissaoPercentual ? String(parsed.data.comissaoPercentual) : null,
      vigenciaInicio: new Date(parsed.data.vigenciaInicio),
      vigenciaFim: new Date(parsed.data.vigenciaFim),
      status: parsed.data.status ?? 'ativa',
      createdAt: now,
    });

    const result = await db
      .select()
      .from(policies)
      .where(eq(policies.id, policyId))
      .limit(1);

    res.status(201).json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar apólice' });
  }
});

// PUT /api/policies/:id - Atualizar apólice
policiesRouter.put('/:id', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const parsed = createPolicySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos' });
      return;
    }

    // Verificar se policy existe e pertence a esta empresa
    const existing = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.companyId, companyId),
          eq(policies.id, req.params.id),
        ),
      )
      .limit(1);

    if (!existing.length) {
      res.status(404).json({ error: 'Apólice não encontrada' });
      return;
    }

    const updateData: Record<string, any> = {};

    if (parsed.data.clientId !== undefined) updateData.clientId = parsed.data.clientId;
    if (parsed.data.dealId !== undefined) updateData.dealId = parsed.data.dealId;
    if (parsed.data.ramo !== undefined) updateData.ramo = parsed.data.ramo;
    if (parsed.data.seguradora !== undefined) updateData.seguradora = parsed.data.seguradora;
    if (parsed.data.premioAnual !== undefined) updateData.premioAnual = String(parsed.data.premioAnual);
    if (parsed.data.comissaoPercentual !== undefined) updateData.comissaoPercentual = parsed.data.comissaoPercentual ? String(parsed.data.comissaoPercentual) : null;
    if (parsed.data.vigenciaInicio !== undefined) updateData.vigenciaInicio = new Date(parsed.data.vigenciaInicio);
    if (parsed.data.vigenciaFim !== undefined) updateData.vigenciaFim = new Date(parsed.data.vigenciaFim);
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    if (Object.keys(updateData).length > 0) {
      await db
        .update(policies)
        .set(updateData)
        .where(
          and(
            eq(policies.companyId, companyId),
            eq(policies.id, req.params.id),
          ),
        );
    }

    const updated = await db
      .select()
      .from(policies)
      .where(eq(policies.id, req.params.id))
      .limit(1);

    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar apólice' });
  }
});
