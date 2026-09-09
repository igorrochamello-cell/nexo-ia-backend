import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, closeDb } from './client';

async function main() {
  await migrate(db, { migrationsFolder: './drizzle' });
  // eslint-disable-next-line no-console
  console.log('[nexo-ia] migrações aplicadas com sucesso.');
  await closeDb();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[nexo-ia] falha ao migrar:', err);
  process.exit(1);
});
