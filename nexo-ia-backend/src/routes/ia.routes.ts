import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireCompanyContext } from '../auth/middleware';
import { findCompanyById } from '../modules/companies/repository';
import { findClientById } from '../modules/clients/repository';
import { runNexoIaConversation } from '../ia/orchestrator';
import { IaNotConfiguredError } from '../ia/openaiClient';
import type { ToolExecutionContext } from '../ia/tools/types';

export const iaRouter = Router();

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
  // Contexto opcional enviado pelo frontend quando a conversa nasce de uma
  // tela específica — ex: o botão "NEXO IA" na ficha do cliente (item 7).
  // O id é revalidado contra o tenant abaixo; nunca é confiado às cegas.
  context: z
    .object({
      clienteId: z.string().uuid().optional(),
    })
    .optional(),
});

// Único endpoint HTTP da NEXO IA — a interface global "Pergunte à NEXO" e o
// botão "NEXO IA" na ficha do cliente são só dois lugares diferentes do
// frontend chamando esta mesma rota, com um `context` diferente.
iaRouter.post('/chat', requireAuth, requireCompanyContext, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Corpo da requisição inválido.', detalhes: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!; // garantido por requireAuth + requireCompanyContext
  const scope = { companyId: auth.companyId! };

  const empresa = await findCompanyById(scope.companyId);
  if (!empresa) {
    res.status(404).json({ error: 'Empresa não encontrada.' });
    return;
  }

  // Revalida o cliente em foco contra o tenant do usuário autenticado — um
  // clienteId de outra empresa, mesmo que enviado pelo frontend, nunca entra
  // no contexto da IA.
  let activeClientId: string | undefined;
  if (parsed.data.context?.clienteId) {
    const cliente = await findClientById(scope, parsed.data.context.clienteId);
    activeClientId = cliente?.id;
  }

  const ctx: ToolExecutionContext = {
    scope,
    user: { id: auth.userId, nome: auth.nome, role: auth.role },
    activeClientId,
  };

  try {
    const result = await runNexoIaConversation(ctx, empresa.nomeFantasia, parsed.data.messages);
    res.json(result);
  } catch (err) {
    if (err instanceof IaNotConfiguredError) {
      res.status(503).json({ error: 'A NEXO IA ainda não está configurada neste ambiente (falta OPENAI_API_KEY).' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[nexo-ia] erro ao processar conversa:', err);
    res.status(502).json({ error: 'Não foi possível falar com a NEXO IA agora. Tente novamente em instantes.' });
  }
});
