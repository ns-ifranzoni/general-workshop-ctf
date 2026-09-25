const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '../data');
require('fs').mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'data.db'));

// WAL mode: allows concurrent readers + one writer without blocking each other.
// NORMAL sync is safe under WAL and significantly faster than FULL.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS access_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    label TEXT,
    role TEXT NOT NULL DEFAULT 'participant',
    username TEXT,
    password_hash TEXT,
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Text challenges: the participant submits an answer that is compared with
  -- the flag (case-insensitive, surrounding/duplicate whitespace ignored).
  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_num INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    flag TEXT,
    points INTEGER NOT NULL DEFAULT 50,
    hint TEXT DEFAULT NULL,
    visible INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS challenge_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_code TEXT NOT NULL,
    challenge_id INTEGER NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 50,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(participant_code, challenge_id)
  );

  -- Failed answers (is_hint = 0, with the submitted text in answer) and hint
  -- penalties (is_hint = 1). Each row costs the participant 5 points.
  -- retry_cleared = 1 marks failed answers already counted towards a cooldown:
  -- they keep their penalty but no longer count against the retry limit.
  CREATE TABLE IF NOT EXISTS challenge_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_code TEXT NOT NULL,
    challenge_id INTEGER NOT NULL,
    is_hint INTEGER NOT NULL DEFAULT 0,
    answer TEXT,
    retry_cleared INTEGER NOT NULL DEFAULT 0,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hint_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_code TEXT NOT NULL,
    challenge_id INTEGER NOT NULL,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(participant_code, challenge_id)
  );

  CREATE INDEX IF NOT EXISTS idx_completions_participant ON challenge_completions(participant_code);
  CREATE INDEX IF NOT EXISTS idx_completions_challenge   ON challenge_completions(challenge_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_participant    ON challenge_attempts(participant_code);
  CREATE INDEX IF NOT EXISTS idx_attempts_part_ch        ON challenge_attempts(participant_code, challenge_id);
`);

// Add columns missing from databases created by earlier builds (no-op otherwise).
for (const ddl of [
  'ALTER TABLE challenge_attempts ADD COLUMN answer TEXT',
  'ALTER TABLE challenge_attempts ADD COLUMN retry_cleared INTEGER NOT NULL DEFAULT 0',
]) {
  try { db.exec(ddl); } catch { /* column already exists */ }
}

// ── Seed defaults (only when absent, so admin changes survive restarts) ──
const DEFAULT_CTF_TIMER_SECONDS = 2 * 3600;
const DEFAULT_REGISTRATION_CODE = 'workshop2026';
const DEFAULT_ADMIN = 'ADMIN-2026';
const DEFAULT_WORKSHOP_NAME = 'Workshop CTF';

function seedSetting(key, value) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

seedSetting('max_retries', '5');
seedSetting('ctf_timer_total', String(DEFAULT_CTF_TIMER_SECONDS));
seedSetting('ctf_timer_remaining', String(DEFAULT_CTF_TIMER_SECONDS));
seedSetting('ctf_timer_started_at', '');
seedSetting('registration_code', DEFAULT_REGISTRATION_CODE);
seedSetting('workshop_name', DEFAULT_WORKSHOP_NAME);
// The CTF always boots stopped; the instructor starts it explicitly.
db.prepare("INSERT INTO settings (key, value) VALUES ('ctf_state', 'stop') ON CONFLICT(key) DO UPDATE SET value = 'stop'").run();

// JWT secret: env var > DB > auto-generate and persist
seedSetting('jwt_secret', crypto.randomBytes(48).toString('hex'));
const JWT_SECRET = process.env.JWT_SECRET || db.prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get().value;

// Default admin: created WITHOUT a password. On first login the portal asks to
// set one (see routes/auth.js admin-setup), so no known credential ships. The
// API token is random per install: middleware/auth accepts an admin api_key as
// a bearer token, so a fixed value would be an authentication bypass.
if (!db.prepare("SELECT id FROM access_codes WHERE role = 'admin' LIMIT 1").get()) {
  db.prepare("INSERT INTO access_codes (code, api_key, label, role, username, password_hash) VALUES (?, ?, 'Administrator', 'admin', ?, NULL)")
    .run(DEFAULT_ADMIN, crypto.randomBytes(24).toString('hex'), DEFAULT_ADMIN);
}

module.exports = db;
module.exports.JWT_SECRET = JWT_SECRET;
module.exports.DEFAULT_CTF_TIMER_SECONDS = DEFAULT_CTF_TIMER_SECONDS;
module.exports.DEFAULT_REGISTRATION_CODE = DEFAULT_REGISTRATION_CODE;
module.exports.DEFAULT_ADMIN = DEFAULT_ADMIN;
module.exports.DEFAULT_WORKSHOP_NAME = DEFAULT_WORKSHOP_NAME;
