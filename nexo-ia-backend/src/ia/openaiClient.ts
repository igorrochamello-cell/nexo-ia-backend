import OpenAI from 'openai';
import { env } from '../env';

let client: OpenAI | null = null;

// Único ponto de todo o backend que instancia o SDK da OpenAI. Nenhum outro
// módulo (e nenhuma rota, nenhum componente de frontend) pode importar
// `openai` diretamente — é assim que o item 10 do pedido ("não espalhar
// chamadas da OpenAI pelos componentes") vira uma regra estrutural, não só
// uma convenção de code review.
export function getOpenAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new IaNotConfiguredError();
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

export class IaNotConfiguredError extends Error {
  constructor() {
    super('OPENAI_API_KEY não configurada neste ambiente.');
    this.name = 'IaNotConfiguredError';
  }
}
