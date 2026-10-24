import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';
import { migrateDatabase } from './schema.js';

mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });

export const db = new Database(config.DATABASE_PATH);
// WAL permite leituras concorrentes enquanto uma escrita/transacao acontece.
// As transacoes criticas (aprovacao de pagamento) usam BEGIN IMMEDIATE.
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

export function migrate() {
  migrateDatabase(db);
}

export function getSetting(key, fallback = null) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
