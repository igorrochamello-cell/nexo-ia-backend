import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { clients, deals, pipelineStages, pipelines, users } from '../../db/schema';
import type { TenantScope } from '../tenant-scope';

const dealWithJoins = {
  id: deals.id,
  companyId: deals.companyId,
  clientId: deals.clientId,
  clienteNome: clients.nome,
  pipelineId: deals.pipelineId,
  pipelineNome: pipelines.nome,
  stageId: deals.stageId,
  etapaNome: pipelineStages.nome,
  corretorId: deals.corretorId,
  corretorNome: users.nome,
  ramo: deals.ramo,
  seguradora: deals.seguradora,
  valorEstimado: deals.valorEstimado,
  status: deals.status,
  stageChangedAt: deals.stageChangedAt,
  createdAt: deals.createdAt,
};

function baseDealQuery() {
  return db
    .select(dealWithJoins)
    .from(deals)
    .innerJoin(clients, eq(clients.id, deals.clientId))
    .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .innerJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
    .innerJoin(users, eq(users.id, deals.corretorId));
}

export async function findDealById(scope: TenantScope, id: string) {
  const rows = await baseDealQuery().where(and(eq(deals.companyId, scope.companyId), eq(deals.id, id)));
  return rows[0] ?? null;
}

export async function searchDeals(scope: TenantScope, query: string, limit = 10) {
  const term = `%${query}%`;
  return baseDealQuery()
    .where(and(eq(deals.companyId, scope.companyId), or(ilike(clients.nome, term), ilike(deals.ramo, term))))
    .limit(limit);
}

export interface ListPipelineDealsFilter {
  pipelineId?: string;
  status?: 'aberto' | 'ganho' | 'perdido' | 'congelado';
  corretorId?: string; // usado para restringir a "só os meus negócios" quando o usuário não é gestão
}

export async function listPipelineDeals(scope: TenantScope, filter: ListPipelineDealsFilter = {}, limit = 50) {
  const conditions = [eq(deals.companyId, scope.companyId)];
  if (filter.pipelineId) conditions.push(eq(deals.pipelineId, filter.pipelineId));
  if (filter.status) conditions.push(eq(deals.status, filter.status));
  if (filter.corretorId) conditions.push(eq(deals.corretorId, filter.corretorId));

  return baseDealQuery()
    .where(and(...conditions))
    .orderBy(desc(deals.stageChangedAt))
    .limit(limit);
}

export async function listDealsByClient(scope: TenantScope, clientId: string) {
  return baseDealQuery()
    .where(and(eq(deals.companyId, scope.companyId), eq(deals.clientId, clientId)))
    .orderBy(desc(deals.createdAt));
}

// Usado por analisar_pipeline: todos os negócios em aberto de um funil, com
// o tempo parado na etapa atual calculado depois em memória (services/analise.ts).
export async function listOpenDealsForPipeline(scope: TenantScope, pipelineId: string) {
  return baseDealQuery()
    .where(and(eq(deals.companyId, scope.companyId), eq(deals.pipelineId, pipelineId), eq(deals.status, 'aberto')))
    .orderBy(desc(deals.stageChangedAt));
}
