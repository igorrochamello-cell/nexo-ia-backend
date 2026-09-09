import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { env } from '../env';

// Pool único de conexão, reaproveitado pela aplicação inteira. Cada request
// resolve seu próprio contexto de tenant (ver src/auth/middleware.ts) e usa
// este mesmo pool — o isolamento entre empresas acontece na camada de query
// (repositórios sempre filtram por company_id), não numa conexão por tenant.
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export async function closeDb(): Promise<void> {
  await pool.end();
}
