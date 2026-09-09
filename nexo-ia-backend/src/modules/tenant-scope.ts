// Tipo mínimo que todo repositório exige para rodar uma query. É construído
// SÓ a partir do TenantContext resolvido pelo middleware de auth (ver
// src/auth/middleware.ts) — nunca a partir de um id enviado pelo cliente.
// Isso torna estruturalmente difícil (não só "por convenção") escrever uma
// consulta que esqueça o filtro de empresa: a assinatura da função pede o
// escopo antes de qualquer outro parâmetro.
export interface TenantScope {
  companyId: string;
}
