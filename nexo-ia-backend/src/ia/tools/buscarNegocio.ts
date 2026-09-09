import { z } from 'zod';
import { findDealById, searchDeals } from '../../modules/deals/repository';
import type { ToolDefinition } from './types';

const schema = z.object({
  negocioId: z.string().uuid().optional().describe('Id exato do negócio/oportunidade, quando já conhecido.'),
  busca: z
    .string()
    .min(2)
    .optional()
    .describe('Nome do cliente ou ramo do seguro (auto, vida, saúde...) para buscar negócios.'),
});

export const buscarNegocioTool: ToolDefinition<z.infer<typeof schema>> = {
  name: 'buscar_negocio',
  description:
    'Busca um ou mais negócios (oportunidades do funil de vendas) da corretora do usuário logado, por id, nome do cliente ou ramo.',
  schema,
  readOnly: true,
  async execute(args, ctx) {
    if (!args.negocioId && !args.busca) {
      return { result: { erro: 'Informe negocioId ou um termo de busca.' }, recordIds: [] };
    }
    if (args.negocioId) {
      const negocio = await findDealById(ctx.scope, args.negocioId);
      return { result: negocio ?? { erro: 'Negócio não encontrado nesta empresa.' }, recordIds: negocio ? [negocio.id] : [] };
    }
    const negocios = await searchDeals(ctx.scope, args.busca!);
    return { result: negocios, recordIds: negocios.map((d) => d.id) };
  },
};
