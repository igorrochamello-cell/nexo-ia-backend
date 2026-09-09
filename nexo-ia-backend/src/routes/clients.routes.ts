import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireCompanyContext } from '../auth/middleware';
import { db } from '../db/client';
import { clients } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export const clientsRouter = Router();

clientsRouter.use(requireAuth, requireCompanyContext);

const createClientSchema = z.object({
  nome: z.string().min(1),
  documento: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email().optional(),
  cidade: z.string().optional(),
  vendedorId: z.string().uuid().optional(),
  indicadoPor: z.string().optional(),
  observacoes: z.string().optional(),
});

// GET /api/clients - Listar clientes
clientsRouter.get('/', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const result = await db
      .select()
      .from(clients)
      .where(eq(clients.companyId, companyId));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

// GET /api/clients/:id - Obter cliente específico
clientsRouter.get('/:id', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const result = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.companyId, companyId),
          eq(clients.id, req.params.id),
        ),
      )
      .limit(1);

    if (!result.length) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// POST /api/clients - Criar novo cliente
clientsRouter.post('/', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.errors });
      return;
    }

    const clientId = crypto.randomUUID();

    await db.insert(clients).values({
      id: clientId,
      companyId: companyId,
      nome: parsed.data.nome,
      documento: parsed.data.documento ?? null,
      telefone: parsed.data.telefone ?? null,
      email: parsed.data.email ?? null,
      cidade: parsed.data.cidade ?? null,
      vendedorId: parsed.data.vendedorId ?? null,
      indicadoPor: parsed.data.indicadoPor ?? null,
      observacoes: parsed.data.observacoes ?? null,
      createdAt: new Date(),
    });

    const inserted = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    res.status(201).json(inserted[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

// PUT /api/clients/:id - Atualizar cliente
clientsRouter.put('/:id', async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Sem acesso a empresa' });
      return;
    }

    const parsed = createClientSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos' });
      return;
    }

    // Verificar se cliente existe e pertence a esta empresa
    const existing = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.companyId, companyId),
          eq(clients.id, req.params.id),
        ),
      )
      .limit(1);

    if (!existing.length) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }

    const current = existing[0];
    await db
      .update(clients)
      .set({
        nome: parsed.data.nome ?? current.nome,
        documento: parsed.data.documento ?? current.documento,
        telefone: parsed.data.telefone ?? current.telefone,
        email: parsed.data.email ?? current.email,
        cidade: parsed.data.cidade ?? current.cidade,
        vendedorId: parsed.data.vendedorId ?? current.vendedorId,
        indicadoPor: parsed.data.indicadoPor ?? current.indicadoPor,
        observacoes: parsed.data.observacoes ?? current.observacoes,
      })
      .where(
        and(
          eq(clients.companyId, companyId),
          eq(clients.id, req.params.id),
        ),
      );

    const updated = await db
      .select()
      .from(clients)
      .where(eq(clients.id, req.params.id))
      .limit(1);

    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});
