import { sql } from 'drizzle-orm';
import { db, closeDb } from './client';

const TABLES = [
  'ia_usage_logs',
  'tasks',
  'policies',
  'deals',
  'pipeline_stages',
  'pipelines',
  'clients',
  'users',
  'companies',
];

async function main() {
  for (const table of TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`));
  }
  // eslint-disable-next-line no-console
  console.log('[nexo-ia] banco de desenvolvimento limpo.');
  await closeDb();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[nexo-ia] falha ao limpar o banco:', err);
  process.exit(1);
});
