const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'links.db');

// Garante que a pasta do banco existe antes de abrir a conexão
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

// WAL melhora a concorrência entre leituras e escritas
db.pragma('journal_mode = WAL');
// O SQLite não valida chaves estrangeiras por padrão
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT    NOT NULL UNIQUE,
    original_url TEXT    NOT NULL,
    clicks       INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Um registro por acesso. Não guarda IP nem user-agent.
  CREATE TABLE IF NOT EXISTS clicks_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id     INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    accessed_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Acelera consultas de último acesso e acessos por dia de um link
  CREATE INDEX IF NOT EXISTS idx_clicks_log_link_accessed
    ON clicks_log (link_id, accessed_at);
`);

module.exports = db;
