// src/db/connection.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, Client } from 'pg';
import * as schema from './schema';
import { logger } from '@/utils/logger';

let pool: Pool;
let db: any;

export async function initializeDatabase() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL not set in environment variables');
    }

    // Create connection pool
    pool = new Pool({
      connectionString,
      min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
      max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });

    // Test connection
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      logger.info('✅ Database connected:', result.rows[0]);
    } finally {
      client.release();
    }

    // Initialize Drizzle ORM
    db = drizzle(pool, { schema });

    logger.info('✅ Drizzle ORM initialized');
    return { pool, db };
  } catch (error) {
    logger.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export function getDrizzleClient(): typeof db {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function disconnectDatabase() {
  if (pool) {
    await pool.end();
    logger.info('✅ Database connection closed');
  }
}

// ========== TRANSACTION HELPER WITH RLS CONTEXT ==========
export async function executeWithTenantContext<T>(
  companyId: string,
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN TRANSACTION');

    // 1. SET app.company_id for RLS (CRITICAL)
    await client.query(`SET app.company_id = $1`, [companyId]);

    // 2. Execute callback
    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // 3. RESET app.company_id (CRITICAL for connection pooling safety)
    try {
      await client.query('RESET app.company_id');
    } catch (err) {
      logger.warn('Failed to reset app.company_id:', err);
    }
    client.release();
  }
}

// ========== EXAMPLE USAGE ==========
// const result = await executeWithTenantContext('company-id', async (client) => {
//   const rows = await client.query('SELECT * FROM clients');
//   return rows.rows;
// });
