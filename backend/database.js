const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bills.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    email         TEXT    UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS debts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    type             TEXT    NOT NULL DEFAULT 'loan',
    original_balance REAL    NOT NULL DEFAULT 0,
    current_balance  REAL    NOT NULL DEFAULT 0,
    interest_rate    REAL    NOT NULL DEFAULT 0,
    min_payment      REAL    NOT NULL DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS paychecks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    schedule_type TEXT    NOT NULL,
    amount        REAL    NOT NULL DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bills (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    amount       REAL    NOT NULL,
    paycheck_id  INTEGER REFERENCES paychecks(id) ON DELETE SET NULL,
    is_paid      INTEGER NOT NULL DEFAULT 0,
    due_date     TEXT,
    recurrence   TEXT    DEFAULT 'monthly',
    period       TEXT,
    group_id     TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS account (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance    REAL    NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: add anchor_date to paychecks (for biweekly schedule)
try { db.exec('ALTER TABLE paychecks ADD COLUMN anchor_date TEXT'); } catch (_) {}

// Migration: add debt_id and principal_paid columns to bills
try { db.exec('ALTER TABLE bills ADD COLUMN debt_id INTEGER REFERENCES debts(id) ON DELETE SET NULL'); } catch (_) {}
try { db.exec('ALTER TABLE bills ADD COLUMN principal_paid REAL'); } catch (_) {}
try { db.exec('ALTER TABLE bills ADD COLUMN sort_order INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE debts ADD COLUMN sort_order INTEGER'); } catch (_) {}

// Migration: autopay support
try { db.exec('ALTER TABLE bills ADD COLUMN is_autopay INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE bills ADD COLUMN pay_on TEXT'); } catch (_) {}

// Migration: add period column if it doesn't exist yet
try {
  db.exec('ALTER TABLE bills ADD COLUMN period TEXT');
} catch (_) {
  // Column already exists — ignore
}

// Migration: add group_id column if it doesn't exist yet
try {
  db.exec('ALTER TABLE bills ADD COLUMN group_id TEXT');
} catch (_) {
  // Column already exists — ignore
}

// Migrate legacy bills with no period to the current YYYY-MM
const now = new Date();
const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
db.prepare('UPDATE bills SET period = ? WHERE period IS NULL').run(currentPeriod);

module.exports = db;
