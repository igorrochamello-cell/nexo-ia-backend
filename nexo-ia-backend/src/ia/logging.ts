import { db } from '../db/client';
import { iaUsageLogs } from '../db/schema';
import type { ToolExecutionContext } from './tools/types';

export interface IaLogEntry {
  ctx: ToolExecutionContext;
  tool: string | null; // null = turno só de conversa, sem chamada de ferramenta
  recordIds: string[];
  promptTokens?: number;
  completionTokens?: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

// Grava só metadados de auditoria (item 9 do pedido): quem, empresa, quando,
// qual ferramenta, quais ids foram tocados, consumo de tokens e erro — nunca
// o texto da pergunta nem o conteúdo integral dos registros consultados.
// `errorMessage`, quando existe, é a mensagem técnica do erro (ex: "timeout
// da OpenAI"), não um trecho da conversa do usuário.
export async function logIaUsage(entry: IaLogEntry): Promise<void> {
  try {
    await db.insert(iaUsageLogs).values({
      companyId: entry.ctx.scope.companyId,
      userId: entry.ctx.user.id,
      tool: entry.tool,
      recordIds: entry.recordIds,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      status: entry.status,
      errorMessage: entry.errorMessage?.slice(0, 500),
    });
  } catch (err) {
    // Uma falha de log nunca pode derrubar a resposta ao usuário — só avisa
    // no stderr do servidor.
    // eslint-disable-next-line no-console
    console.error('[nexo-ia] falha ao gravar log de auditoria da IA:', err);
  }
}
