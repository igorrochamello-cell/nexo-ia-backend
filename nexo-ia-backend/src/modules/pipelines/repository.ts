import { and, asc, eq, ilike } from 'drizzle-orm';
import { db } from '../../db/client';
import { pipelineStages, pipelines } from '../../db/schema';
import type { TenantScope } from '../tenant-scope';

export async function listPipelines(scope: TenantScope) {
  return db.select().from(pipelines).where(eq(pipelines.companyId, scope.companyId));
}

export async function findPipelineByName(scope: TenantScope, nome: string) {
  const rows = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.companyId, scope.companyId), ilike(pipelines.nome, nome)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findPipelineById(scope: TenantScope, id: string) {
  const rows = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.companyId, scope.companyId), eq(pipelines.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

// Sem escopo de tenant aqui de propósito: pipeline_stages não tem company_id
// próprio (herda do pipeline pai). Todo chamador deve primeiro validar que o
// pipelineId pertence ao tenant (findPipelineById) antes de listar as etapas.
export async function listStagesByPipeline(pipelineId: string) {
  return db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, pipelineId)).orderBy(asc(pipelineStages.ordem));
}
