import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { getOpenAIClient } from './openaiClient';
import { buildOpenAiToolDefinitions, TOOL_REGISTRY } from './tools/index';
import { buildSystemPrompt } from './systemPrompt';
import { logIaUsage } from './logging';
import type { ToolExecutionContext } from './tools/types';
import { env } from '../env';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCallTrace {
  tool: string;
  args: unknown;
  ok: boolean;
}

export interface NexoIaResult {
  reply: string;
  toolCalls: ToolCallTrace[];
}

const MAX_TOOL_ITERATIONS = 5;

// Orquestrador NEXO IA — único lugar do backend que fala com a Responses API
// da OpenAI numa conversa de verdade (openaiClient.ts é usado só por aqui).
// Fluxo: Frontend → rota /api/ia/chat → este orquestrador → OpenAI →
// (se houver tool call) Tools NEXO → repositórios com escopo de tenant →
// Postgres → resultado volta pro modelo → resposta final.
export async function runNexoIaConversation(
  ctx: ToolExecutionContext,
  empresaNome: string,
  messages: ChatTurn[],
): Promise<NexoIaResult> {
  const client = getOpenAIClient();
  const tools = buildOpenAiToolDefinitions();

  let input: ResponseInputItem[] = [
    { role: 'system', content: buildSystemPrompt(ctx, empresaNome) },
    ...messages.map((m): ResponseInputItem => ({ role: m.role, content: m.content })),
  ];

  const toolCalls: ToolCallTrace[] = [];
  let previousResponseId: string | undefined;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input,
      tools,
      tool_choice: 'auto',
      previous_response_id: previousResponseId,
    });

    totalPromptTokens += response.usage?.input_tokens ?? 0;
    totalCompletionTokens += response.usage?.output_tokens ?? 0;

    const functionCalls = response.output.filter(
      (item): item is Extract<typeof item, { type: 'function_call' }> => item.type === 'function_call',
    );

    if (functionCalls.length === 0) {
      await logIaUsage({
        ctx,
        tool: null,
        recordIds: [],
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        status: 'success',
      });
      return { reply: response.output_text, toolCalls };
    }

    const toolOutputs: ResponseInputItem[] = [];

    for (const call of functionCalls) {
      const tool = TOOL_REGISTRY[call.name];
      let outputPayload: unknown;
      let ok = true;
      let parsedArgs: unknown = {};

      if (!tool) {
        ok = false;
        outputPayload = { erro: `Ferramenta desconhecida: ${call.name}` };
      } else {
        try {
          const rawArgs = call.arguments ? JSON.parse(call.arguments) : {};
          parsedArgs = tool.schema.parse(rawArgs);
          const { result, recordIds } = await tool.execute(parsedArgs, ctx);
          outputPayload = result;
          await logIaUsage({ ctx, tool: tool.name, recordIds, status: 'success' });
        } catch (err) {
          ok = false;
          const message = err instanceof Error ? err.message : 'Erro desconhecido ao executar a ferramenta.';
          outputPayload = { erro: message };
          await logIaUsage({ ctx, tool: tool.name, recordIds: [], status: 'error', errorMessage: message });
        }
      }

      toolCalls.push({ tool: call.name, args: parsedArgs, ok });
      toolOutputs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(outputPayload),
      });
    }

    previousResponseId = response.id;
    input = toolOutputs;
  }

  await logIaUsage({
    ctx,
    tool: null,
    recordIds: [],
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    status: 'error',
    errorMessage: `Limite de ${MAX_TOOL_ITERATIONS} chamadas de ferramenta em sequência atingido.`,
  });

  return {
    reply:
      'Não consegui concluir essa consulta — ela pediu chamadas demais em sequência às ferramentas. Tente reformular de um jeito mais específico.',
    toolCalls,
  };
}
