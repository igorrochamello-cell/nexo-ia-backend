import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { tasks } from '../../db/schema';
import type { TenantScope } from '../tenant-scope';

export interface ListUserTasksFilter {
  pendingOnly?: boolean;
}

export async function listUserTasks(scope: TenantScope, userId: string, filter: ListUserTasksFilter = {}) {
  const conditions = [eq(tasks.companyId, scope.companyId), eq(tasks.responsavelId, userId)];
  if (filter.pendingOnly) conditions.push(eq(tasks.concluida, false));

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.data));
}

export async function listTasksByClient(scope: TenantScope, clientId: string) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.companyId, scope.companyId), eq(tasks.clientId, clientId)))
    .orderBy(asc(tasks.data));
}
