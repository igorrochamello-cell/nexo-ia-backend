import { z } from 'zod';
import { listUpcomingRenewals } from '../../modules/policies/repository';
import type { ToolDefinition } from './types';

const schema = z.object({
  dentroDeDias: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Janela de dias até o vencimento a considerar. Padrão: 30.'),
});

export const buscarRenovacoesTool: ToolDefinition<z.infer<typeof schema>> = {
  name: 'buscar_renovacoes',
  description:
    'Lista as apólices ativas da empresa cujo vencimento cai dentro da janela de dias informada (padrão 30 dias) — o mesmo painel de renovações do CRM.',
  schema,
  readOnly: true,
  async execute(args, ctx) {
    const renovacoes = await listUpcomingRenewals(ctx.scope, args.dentroDeDias ?? 30);
    return { result: renovacoes, recordIds: renovacoes.map((p) => p.id) };
  },
};
