import { sql } from 'drizzle-orm';
import { db, closeDb } from './src/db/client';

// Todas as tabelas no banco, em ordem de dependência reversa
const TABLES = [
  'timeline_events',
  'commissions',
  'health_requests',
  'endorsements',
  'claims',
  'renewals',
  'deals',
  'policies',
  'pipeline_stages',
  'pipelines',
  'tasks',
  'users',
  'clients',
  'companies',
  'ia_usage_logs',
];

async function resetDatabase() {
  console.log('[nexo-ia] iniciando limpeza completa do banco...');

  try {
    for (const table of TABLES) {
      console.log(`  deletando: ${table}`);
      await db.execute(sql.raw(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`));
    }

    console.log('[nexo-ia] ✅ banco de dados limpo com sucesso!');
    console.log('[nexo-ia] próximo passo: npm run db:migrate');
  } catch (err) {
    console.error('[nexo-ia] ❌ falha ao limpar o banco:', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

resetDatabase();
