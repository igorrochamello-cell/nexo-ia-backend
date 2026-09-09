import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireCompanyContext } from '../auth/middleware';
import { db } from '../db/client';
import { timelineEvents } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const auditRouter = Router();

auditRouter.use(requireAuth, requireCompanyContext);

const logActionSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  table: z.string(),
  recordId: z.string().uuid().optional(),
  changes: z.record(z.any()).optional(),
  timestamp: z.string().optional(),
});

// POST /api/audit/log - Registrar ação (chamado pelo frontend)
auditRouter.post('/log', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const parsed = logActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos' });
      return;
    }

    const { action, table, recordId, changes } = parsed.data;
    const user = req.auth;

    await db.insert(timelineEvents).values({
      id: crypto.randomUUID(),
      companyId: companyId,
      userId: user!.userId,
      tipo: action,
      descricao: `${action.toUpperCase()} em ${table}${recordId ? ' (' + recordId + ')' : ''}`,
      tabela: table,
      recordId: recordId ?? null,
      dados: JSON.stringify(changes || {}),
      criadoEm: new Date(parsed.data.timestamp || new Date()),
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar ação' });
  }
});

// GET /api/audit/logs - Listar logs de auditoria da empresa
auditRouter.get('/logs', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.companyId, companyId))
      .orderBy(desc(timelineEvents.criadoEm))
      .limit(limit)
      .offset(offset);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar logs' });
  }
});

// GET /api/audit/logs/:recordId - Listar histórico de um registro específico
auditRouter.get('/logs/:recordId', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const result = await db
      .select()
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.companyId, companyId),
          eq(timelineEvents.recordId, req.params.recordId as any),
        ),
      )
      .orderBy(desc(timelineEvents.criadoEm));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});
