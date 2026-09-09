import { z } from 'zod';
import { listPipelineDeals } from '../../modules/deals/repository';
import { findPipelineByName, listPipelines } from '../../modules/pipelines/repository';
import type { ToolDefinition } from './types';
import { isGestao } from '../roles';

const schema = z.object({
  pipelineNome: z
    .string()
    .optional()
    .describe('Nome do funil (ex: "Comercial", "Renovação"). Se omitido, usa todos os funis da empresa.'),
  status: z.enum(['aberto', 'ganho', 'perdido', 'congelado']).optional().describe('Filtra por status do negócio. Padrão: aberto.'),
});

export const listarNegociosPipelineTool: ToolDefinition<z.infer<typeof schema>> = {
  name: 'listar_negocios_pipeline',
  description:
    'Lista os negócios de um funil de vendas (kanban) da empresa do usuário. Por padrão só traz negócios em aberto. ' +
    'Usuários que não são gestão só veem os próprios negócios; usuários de gestão veem a carteira inteira da equipe.',
  schema,
  readOnly: true,
  async execute(args, ctx) {
    let pipelineId: string | undefined;
    if (args.pipelineNome) {
      const pipeline = await findPipelineByName(ctx.scope, args.pipelineNome);
      if (!pipeline) {
        return { result: { erro: `Nenhum funil chamado "${args.pipelineNome}" encontrado.` }, recordIds: [] };
      }
      pipelineId = pipeline.id;
    }

    // Mesma regra de visibilidade já aplicada no restante do NEXO: gestão vê
    // tudo, os demais cargos só o próprio recorte — nunca decidido pelo
    // frontend, sempre aplicado aqui, no backend.
    const corretorId = isGestao(ctx.user.role) ? undefined : ctx.user.id;

    const negocios = await listPipelineDeals(ctx.scope, {
      pipelineId,
      status: args.status ?? 'aberto',
      corretorId,
    });

    if (!args.pipelineNome) {
      const pipelines = await listPipelines(ctx.scope);
      return {
        result: { funisDisponiveis: pipelines.map((p) => p.nome), negocios },
        recordIds: negocios.map((d) => d.id),
      };
    }

    return { result: negocios, recordIds: negocios.map((d) => d.id) };
  },
};
