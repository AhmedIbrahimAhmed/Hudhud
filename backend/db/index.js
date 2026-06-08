import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Single shared connection. The DB file lives next to this module.
const db = new Database(join(__dirname, 'hudhud.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema from schema.sql (source of truth for all table structures)
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

export default db;
