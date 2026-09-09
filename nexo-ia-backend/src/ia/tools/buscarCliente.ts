import { z } from 'zod';
import { findClientById, searchClients } from '../../modules/clients/repository';
import type { ToolDefinition } from './types';

const schema = z.object({
  clienteId: z.string().uuid().optional().describe('Id exato do cliente, quando já conhecido.'),
  busca: z
    .string()
    .min(2)
    .optional()
    .describe('Nome, documento (CPF/CNPJ), e-mail ou telefone para buscar o cliente.'),
});

export const buscarClienteTool: ToolDefinition<z.infer<typeof schema>> = {
  name: 'buscar_cliente',
  description:
    'Busca um ou mais clientes da corretora do usuário logado, por id, nome, documento, e-mail ou telefone. ' +
    'Use quando o usuário mencionar um cliente pelo nome, ou quando já souber o clienteId (por exemplo, o cliente que está sendo visualizado na tela).',
  schema,
  readOnly: true,
  async execute(args, ctx) {
    if (!args.clienteId && !args.busca) {
      return { result: { erro: 'Informe clienteId ou um termo de busca.' }, recordIds: [] };
    }
    if (args.clienteId) {
      const cliente = await findClientById(ctx.scope, args.clienteId);
      return { result: cliente ?? { erro: 'Cliente não encontrado nesta empresa.' }, recordIds: cliente ? [cliente.id] : [] };
    }
    const clientes = await searchClients(ctx.scope, args.busca!);
    return { result: clientes, recordIds: clientes.map((c) => c.id) };
  },
};
