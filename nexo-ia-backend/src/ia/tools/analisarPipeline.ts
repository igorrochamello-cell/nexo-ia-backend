import { z } from 'zod';
import { listOpenDealsForPipeline } from '../../modules/deals/repository';
import { findPipelineByName, listPipelines } from '../../modules/pipelines/repository';
import type { ToolDefinition } from './types';

const schema = z.object({
  pipelineNome: z.string().describe('Nome do funil a analisar (ex: "Comercial", "Renovação").'),
});

const DIAS_ATENCAO = 2;
const DIAS_CRITICO = 5;

export const analisarPipelineTool: ToolDefinition<z.infer<typeof schema>> = {
  name: 'analisar_pipeline',
  description:
    'Analisa um funil de vendas: total de negócios em aberto, valor total estimado, ticket médio, distribuição por etapa ' +
    'e quais negócios estão parados há mais tempo na mesma etapa (mesma régua visual do kanban: atenção a partir de 2 dias, crítico a partir de 5 dias).',
  schema,
  readOnly: true,
  async execute(args, ctx) {
    const pipeline = await findPipelineByName(ctx.scope, args.pipelineNome);
    if (!pipeline) {
      const disponiveis = await listPipelines(ctx.scope);
      return {
        result: {
          erro: `Nenhum funil chamado "${args.pipelineNome}" encontrado.`,
          funisDisponiveis: disponiveis.map((p) => p.nome),
        },
        recordIds: [],
      };
    }

    const negocios = await listOpenDealsForPipeline(ctx.scope, pipeline.id);
    const agora = Date.now();

    const porEtapa: Record<string, { quantidade: number; valorTotal: number }> = {};
    let valorTotal = 0;
    const parados: Array<{ id: string; cliente: string; etapa: string; diasParado: number; nivel: 'atencao' | 'critico' }> = [];

    for (const negocio of negocios) {
      const valor = Number(negocio.valorEstimado);
      valorTotal += valor;

      const etapa = negocio.etapaNome;
      porEtapa[etapa] ??= { quantidade: 0, valorTotal: 0 };
      porEtapa[etapa].quantidade += 1;
      porEtapa[etapa].valorTotal += valor;

      const diasParado = Math.floor((agora - new Date(negocio.stageChangedAt).getTime()) / 86_400_000);
      if (diasParado >= DIAS_CRITICO) {
        parados.push({ id: negocio.id, cliente: negocio.clienteNome, etapa, diasParado, nivel: 'critico' });
      } else if (diasParado >= DIAS_ATENCAO) {
        parados.push({ id: negocio.id, cliente: negocio.clienteNome, etapa, diasParado, nivel: 'atencao' });
      }
    }

    return {
      result: {
        pipeline: pipeline.nome,
        totalNegocios: negocios.length,
        valorTotalEstimado: valorTotal,
        ticketMedio: negocios.length ? valorTotal / negocios.length : 0,
        porEtapa,
        negociosParados: parados.sort((a, b) => b.diasParado - a.diasParado),
      },
      recordIds: negocios.map((d) => d.id),
    };
  },
};
