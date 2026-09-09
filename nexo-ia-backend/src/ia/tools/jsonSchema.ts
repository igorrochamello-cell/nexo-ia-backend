import type { ZodTypeAny } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { zodToJsonSchema } = require('zod-to-json-schema') as {
  zodToJsonSchema: (schema: unknown, opts?: unknown) => unknown;
};

// Isolado em seu próprio módulo, chamado via `require` com uma assinatura de
// tipos própria e enxuta (em vez do `import` tipado da biblioteca): a
// combinação da versão instalada do zod (3.25.x) com os tipos genéricos de
// `zod-to-json-schema` faz o TypeScript estourar o limite de instanciação de
// tipos (TS2589) ao tentar inferir o retorno através da cadeia de generics.
// A função continua fazendo exatamente a mesma chamada em runtime — só o
// *tipo* da chamada é simplificado à mão, para o compilador não precisar
// resolver a árvore de tipos condicionais do zod inteira.
export function toJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, { target: 'openApi3' }) as Record<string, unknown>;
}
