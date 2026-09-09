import type { FunctionTool } from 'openai/resources/responses/responses';
import { toJsonSchema } from './jsonSchema';
import type { ToolDefinition } from './types';
import { buscarClienteTool } from './buscarCliente';
import { buscarNegocioTool } from './buscarNegocio';
import { listarNegociosPipelineTool } from './listarNegociosPipeline';
import { buscarRenovacoesTool } from './buscarRenovacoes';
import { listarTarefasUsuarioTool } from './listarTarefasUsuario';
import { buscarHistoricoClienteTool } from './buscarHistoricoCliente';
import { analisarPipelineTool } from './analisarPipeline';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOL_REGISTRY: Record<string, ToolDefinition<any>> = {
  [buscarClienteTool.name]: buscarClienteTool,
  [buscarNegocioTool.name]: buscarNegocioTool,
  [listarNegociosPipelineTool.name]: listarNegociosPipelineTool,
  [buscarRenovacoesTool.name]: buscarRenovacoesTool,
  [listarTarefasUsuarioTool.name]: listarTarefasUsuarioTool,
  [buscarHistoricoClienteTool.name]: buscarHistoricoClienteTool,
  [analisarPipelineTool.name]: analisarPipelineTool,
};

export function buildOpenAiToolDefinitions(): FunctionTool[] {
  return Object.values(TOOL_REGISTRY).map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    // strict:false porque alguns parâmetros são opcionais (o modo estrito da
    // OpenAI hoje exige todo campo do schema listado em "required").
    strict: false,
    parameters: toJsonSchema(tool.schema),
  }));
}
