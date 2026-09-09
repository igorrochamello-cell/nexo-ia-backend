import { z } from 'zod';
import { listUserTasks } from '../../modules/tasks/repository';
import { findUserByNameInCompany } from '../../modules/users/repository';
import type { ToolDefinition } from './types';
import { isGestao } from '../roles';

const schema = z.object({
  apenasPendentes: z.boolean().optional().describe('Se true (padrão), traz só tarefas não concluídas.'),
  usuarioNome: z
    .string()
    .optional()
    .describe(
      'Nome de outro usuário da equipe para ver as tarefas dele, em vez das do próprio usuário logado. ' +
        'Só tem efeito quando quem pergunta é gestão — para os demais cargos, esse campo é ignorado e a busca é sempre sobre o próprio usuário.',
    ),
});

export const listarTarefasUsuarioTool: ToolDefinition<z.infer<typeof schema>> = {
  name: 'listar_tarefas_usuario',
  description:
    'Lista as tarefas/atividades (ligação, reunião, tarefa, e-mail, visita) do usuário logado. ' +
    'Usuários de gestão podem opcionalmente consultar as tarefas de outro membro da equipe pelo nome.',
  schema,
  readOnly: true,
  async execute(args, ctx) {
    let targetUserId = ctx.user.id;

    if (args.usuarioNome && isGestao(ctx.user.role)) {
      const alvo = await findUserByNameInCompany(ctx.scope, args.usuarioNome);
      if (!alvo) {
        return { result: { erro: `Nenhum usuário chamado "${args.usuarioNome}" encontrado nesta empresa.` }, recordIds: [] };
      }
      targetUserId = alvo.id;
    }

    const tarefas = await listUserTasks(ctx.scope, targetUserId, {
      pendingOnly: args.apenasPendentes ?? true,
    });
    return { result: tarefas, recordIds: tarefas.map((t) => t.id) };
  },
};
