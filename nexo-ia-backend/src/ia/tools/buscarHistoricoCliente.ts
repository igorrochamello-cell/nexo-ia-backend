import { z } from 'zod';
import { findClientById } from '../../modules/clients/repository';
import { listDealsByClient } from '../../modules/deals/repository';
import { listPoliciesByClient } from '../../modules/policies/repository';
import { listTasksByClient } from '../../modules/tasks/repository';
import type { ToolDefinition } from './types';

const schema = z.object({
  clienteId: z
    .string()
    .uuid()
    .optional()
    .describe('Id do cliente. Se omitido, usa o cliente que está em foco na tela atual (quando houver).'),
});

// É esta ferramenta que dá suporte ao botão "NEXO IA" na ficha do cliente
// (item 7 do pedido): reúne cliente + negócios + apólices + tarefas numa
// única chamada, tudo já filtrado pela empresa do usuário, para pedidos como
// "resuma esse cliente" não precisarem de várias idas e voltas.
export const buscarHistoricoClienteTool: ToolDefinition<z.infer<typeof schema>> = {
  name: 'buscar_historico_cliente',
  description:
    'Traz o histórico completo permitido de um cliente: dados cadastrais, negócios no funil, apólices e tarefas relacionadas. ' +
    'Use para pedidos como "resuma esse cliente" ou "o que já vendemos pra esse cliente". ' +
    'Se o usuário estiver vendo a ficha de um cliente específico na tela, o id dele já vem no contexto — não é preciso perguntar de novo.',
  schema,
  readOnly: true,
  async execute(args, ctx) {
    const clienteId = args.clienteId ?? ctx.activeClientId;
    if (!clienteId) {
      return {
        result: { erro: 'Nenhum clienteId informado e nenhum cliente em foco na tela atual.' },
        recordIds: [],
      };
    }

    const cliente = await findClientById(ctx.scope, clienteId);
    if (!cliente) {
      return { result: { erro: 'Cliente não encontrado nesta empresa.' }, recordIds: [] };
    }

    const [negocios, apolices, tarefas] = await Promise.all([
      listDealsByClient(ctx.scope, clienteId),
      listPoliciesByClient(ctx.scope, clienteId),
      listTasksByClient(ctx.scope, clienteId),
    ]);

    const recordIds = [cliente.id, ...negocios.map((d) => d.id), ...apolices.map((p) => p.id), ...tarefas.map((t) => t.id)];

    return {
      result: { cliente, negocios, apolices, tarefas },
      recordIds,
    };
  },
};
