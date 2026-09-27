// Migrador one-shot: aplica db/migrations/*.sql en orden y termina.
// docker compose arranca el resto de servicios solo cuando este contenedor
// finaliza con éxito (depends_on: service_completed_successfully).
// Todas las migraciones son idempotentes (IF NOT EXISTS), se pueden re-ejecutar.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPool, logger, waitForDatabase } from '@wandersync/common';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.resolve('db/migrations');

const pool = createPool({ max: 1 });
try {
  await waitForDatabase(pool, { attempts: 60 });
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
      logger.info('migration.applied', { file });
    } catch (err) {
      await client.query('rollback');
      throw new Error(`${file}: ${err.message}`);
    } finally {
      client.release();
    }
  }
  logger.info('migration.done', { count: files.length });
} catch (err) {
  logger.error('migration.failed', { error: err.message });
  process.exitCode = 1;
} finally {
  await pool.end();
}
