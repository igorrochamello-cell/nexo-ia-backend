import { and, asc, eq, lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { clients, policies } from '../../db/schema';
import type { TenantScope } from '../tenant-scope';

const policyWithClient = {
  id: policies.id,
  companyId: policies.companyId,
  clientId: policies.clientId,
  clienteNome: clients.nome,
  ramo: policies.ramo,
  seguradora: policies.seguradora,
  premioAnual: policies.premioAnual,
  comissaoPercentual: policies.comissaoPercentual,
  vigenciaInicio: policies.vigenciaInicio,
  vigenciaFim: policies.vigenciaFim,
  status: policies.status,
};

export async function findPolicyById(scope: TenantScope, id: string) {
  const rows = await db
    .select(policyWithClient)
    .from(policies)
    .innerJoin(clients, eq(clients.id, policies.clientId))
    .where(and(eq(policies.companyId, scope.companyId), eq(policies.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPoliciesByClient(scope: TenantScope, clientId: string) {
  return db
    .select(policyWithClient)
    .from(policies)
    .innerJoin(clients, eq(clients.id, policies.clientId))
    .where(and(eq(policies.companyId, scope.companyId), eq(policies.clientId, clientId)));
}

// Renovações = apólices ativas cujo vencimento (vigenciaFim) cai dentro da
// janela pedida (padrão: 30 dias) — mesma régua usada hoje no protótipo.
export async function listUpcomingRenewals(scope: TenantScope, withinDays = 30) {
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + withinDays);

  return db
    .select(policyWithClient)
    .from(policies)
    .innerJoin(clients, eq(clients.id, policies.clientId))
    .where(
      and(eq(policies.companyId, scope.companyId), eq(policies.status, 'ativa'), lte(policies.vigenciaFim, limitDate)),
    )
    .orderBy(asc(policies.vigenciaFim));
}
