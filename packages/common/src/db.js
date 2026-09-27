import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

/**
 * Pool de conexiones a Postgres (Supabase o local).
 * PGSSL=true exige TLS, como requiere Supabase.
 */
export function createPool({ max = 5 } = {}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada (ver .env.example)');
  }
  const ssl = (process.env.PGSSL ?? 'true') === 'true' ? { rejectUnauthorized: false } : false;
  const pool = new Pool({ connectionString, ssl, max, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => logger.error('pg.pool.error', { error: err.message }));
  return pool;
}

export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(pool, { attempts = 30, delayMs = 2000 } = {}) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      logger.warn('db.waiting', { attempt: i, error: err.message });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('La base de datos no respondió a tiempo');
}
