import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { clients } from '../../db/schema';
import type { TenantScope } from '../tenant-scope';

export async function findClientById(scope: TenantScope, id: string) {
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.companyId, scope.companyId), eq(clients.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function searchClients(scope: TenantScope, query: string, limit = 10) {
  const term = `%${query}%`;
  return db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.companyId, scope.companyId),
        or(
          ilike(clients.nome, term),
          ilike(clients.documento, term),
          ilike(clients.email, term),
          ilike(clients.telefone, term),
        ),
      ),
    )
    .limit(limit);
}

export async function listClientsByVendedor(scope: TenantScope, vendedorId: string) {
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.companyId, scope.companyId), eq(clients.vendedorId, vendedorId)));
}
