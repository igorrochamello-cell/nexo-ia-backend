import { and, eq, ilike } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import type { TenantScope } from '../tenant-scope';

// Único repositório que legitimamente consulta por e-mail sem escopo de
// empresa: é o próprio login, o momento em que ainda não sabemos o tenant —
// é exatamente aqui que ele é decidido, a partir da linha do usuário no
// banco, nunca de algo que o cliente informa.
export async function findUserByEmail(email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

// Usado por ferramentas da IA que precisam resolver "o vendedor Fulano" a
// partir de um nome — sempre restrito à empresa de quem está perguntando,
// nunca uma busca global por nome (isso vazaria existência de usuários de
// outras empresas).
export async function findUserByNameInCompany(scope: TenantScope, nome: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.companyId, scope.companyId), ilike(users.nome, `%${nome}%`)))
    .limit(1);
  return rows[0] ?? null;
}
