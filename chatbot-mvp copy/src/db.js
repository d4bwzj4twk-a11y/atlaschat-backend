const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_PATH || "./data/app.db";
const absoluteDbPath = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });

const db = new Database(absoluteDbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      widget_id TEXT NOT NULL UNIQUE,
      allowed_domain TEXT NOT NULL,
      handoff_email TEXT,
      brand_primary_color TEXT DEFAULT '#111111',
      brand_text_color TEXT DEFAULT '#ffffff',
      tone TEXT DEFAULT 'friendly and concise',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS business_kb_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_kb_business_id ON business_kb_entries(business_id);

    CREATE TABLE IF NOT EXISTS chat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      user_message TEXT NOT NULL,
      assistant_message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_logs_business_id ON chat_logs(business_id);
    CREATE INDEX IF NOT EXISTS idx_logs_session_id ON chat_logs(session_id);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trialing',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );
  `);

  // Lightweight migration path for existing local DBs.
  const businessColumns = db.prepare("PRAGMA table_info(businesses)").all();
  const hasHandoffEmail = businessColumns.some((column) => column.name === "handoff_email");
  if (!hasHandoffEmail) {
    db.exec("ALTER TABLE businesses ADD COLUMN handoff_email TEXT");
  }
}

module.exports = { db, createSchema };
