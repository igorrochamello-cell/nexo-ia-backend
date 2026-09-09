import type { ZodType } from 'zod';
import type { TenantScope } from '../../modules/tenant-scope';
import type { AuthTokenPayload } from '../../auth/jwt';

// Contexto passado a toda ferramenta: além do escopo de tenant (obrigatório
// pra qualquer query), carrega quem está perguntando e, quando a conversa
// nasceu a partir de uma tela específica do CRM (ex: o botão "NEXO IA" na
// ficha do cliente), qual registro estava em foco.
export interface ToolExecutionContext {
  scope: TenantScope;
  user: {
    id: string;
    nome: string;
    role: AuthTokenPayload['role'];
  };
  activeClientId?: string;
}

export interface ToolDefinition<TArgs> {
  name: string;
  description: string;
  schema: ZodType<TArgs>;
  // Toda ferramenta é somente leitura nesta primeira versão (item 6 do
  // pedido) — nenhuma delas grava ou altera nada no banco. Ferramentas de
  // ação (criar tarefa, mover negócio, etc.) entram depois, com o mesmo
  // contrato mas marcadas explicitamente como `readOnly: false` e atrás de
  // uma confirmação explícita do usuário (ver docs/NEXO_IA.md, seção
  // "Próximos passos — ferramentas de ação").
  readOnly: true;
  // Retorna os dados encontrados (serializados de volta pro modelo) e, à
  // parte, a lista de ids realmente tocados — usada só para o log de
  // auditoria (nunca o conteúdo integral do registro).
  execute(args: TArgs, ctx: ToolExecutionContext): Promise<{ result: unknown; recordIds: string[] }>;
}
