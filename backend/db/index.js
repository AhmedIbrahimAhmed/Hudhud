import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Build the connection config from DATABASE_URL, falling back to discrete
// PG* env vars (handy for local dev without a full URL).
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'hudhud',
      }
);

// --- Query helpers (async). get() -> single row, all() -> rows array,
// run() -> { rows, changes } for writes. ---

// Run a query and return the full pg result ({ rows, rowCount, ... }).
async function query(text, params = []) {
  return pool.query(text, params);
}

// Return the first row, or undefined when nothing matched.
async function get(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows[0];
}

// Return all matching rows as an array.
async function all(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

// Execute a write. Returns { rows, changes } where `changes` is the number
// of affected rows. For INSERTs that need the new id, add `RETURNING id` to
// the SQL and read it from `rows[0].id` (or use get()).
async function run(text, params = []) {
  const result = await pool.query(text, params);
  return { rows: result.rows, changes: result.rowCount };
}

// Apply the schema (idempotent — all CREATE ... IF NOT EXISTS) on startup,
// retrying the initial connection a few times since Postgres may still be
// booting in Docker.
async function init({ retries = 10, delayMs = 2000 } = {}) {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await client.query(schema);
      } finally {
        client.release();
      }
      console.log('✅ PostgreSQL connected and schema applied');
      return;
    } catch (e) {
      console.warn(
        `⏳ Waiting for PostgreSQL (attempt ${attempt}/${retries}): ${e.message}`
      );
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export default { pool, query, get, all, run, init };
export { pool, query, get, all, run, init };
