const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "library.sqlite");
const SEED_PATH = path.join(DATA_DIR, "users-seed.json");
const SEED_EXAMPLE = path.join(DATA_DIR, "users-seed.example.json");

let db;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function openDb() {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedUsers(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('resident', 'director')),
      reset_token TEXT,
      reset_token_expires INTEGER,
      created_at INTEGER NOT NULL,
      last_login INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_seen INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK (
        action IN ('login', 'view', 'download', 'failed_login', 'password_reset')
      ),
      file_path TEXT,
      ip_address TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_access_log_ts ON access_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_access_log_user ON access_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_seen ON sessions(last_seen);
  `);
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isPlaceholderEmail(email) {
  const e = normalizeEmail(email);
  return e.endsWith("@example.com") || e.endsWith(".invalid") || e.startsWith("replace_");
}

function loadSeedRows() {
  let file = SEED_PATH;
  if (!fs.existsSync(file) && fs.existsSync(SEED_EXAMPLE)) {
    file = SEED_EXAMPLE;
  }
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw;
  } catch (_) {
    return [];
  }
}

function seedUsers(database) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, role, created_at)
    VALUES (@email, NULL, @role, @created_at)
  `);
  const updateRole = database.prepare(`
    UPDATE users SET role = @role WHERE email = @email COLLATE NOCASE
  `);
  const now = Date.now();
  const rows = loadSeedRows();
  const tx = database.transaction(function (list) {
    for (const row of list) {
      const email = normalizeEmail(row.email);
      if (!email || !email.includes("@")) continue;
      if (isPlaceholderEmail(email)) continue;
      const role = row.role === "director" ? "director" : "resident";
      insert.run({ email, role, created_at: now });
      updateRole.run({ email, role });
    }
  });
  tx(rows);
}

function getDb() {
  return openDb();
}

function findUserByEmail(email) {
  return getDb()
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(normalizeEmail(email));
}

function findUserById(id) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function listUsers() {
  return getDb()
    .prepare(
      "SELECT id, email, role, password_hash IS NOT NULL AS has_password, created_at, last_login FROM users ORDER BY email"
    )
    .all();
}

function setPasswordHash(userId, hash) {
  getDb()
    .prepare(
      "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
    )
    .run(hash, userId);
}

function clearPasswordHash(userId) {
  getDb()
    .prepare(
      "UPDATE users SET password_hash = NULL, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
    )
    .run(userId);
}

function setResetToken(userId, tokenHash, expiresAt) {
  getDb()
    .prepare(
      "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?"
    )
    .run(tokenHash, expiresAt, userId);
}

function findUserByResetTokenHash(tokenHash) {
  return getDb()
    .prepare(
      "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires IS NOT NULL AND reset_token_expires > ?"
    )
    .get(tokenHash, Date.now());
}

function touchLastLogin(userId) {
  getDb()
    .prepare("UPDATE users SET last_login = ? WHERE id = ?")
    .run(Date.now(), userId);
}

function createSession(userId, tokenHash) {
  const now = Date.now();
  getDb()
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, last_seen, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(tokenHash, userId, now, now);
}

function getSession(tokenHash) {
  return getDb()
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .get(tokenHash);
}

function touchSession(tokenHash) {
  getDb()
    .prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?")
    .run(Date.now(), tokenHash);
}

function deleteSession(tokenHash) {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

function deleteSessionsForUser(userId) {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

function pruneExpiredSessions(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  getDb().prepare("DELETE FROM sessions WHERE last_seen < ?").run(cutoff);
}

function writeAccessLog({ userId, action, filePath, ipAddress }) {
  getDb()
    .prepare(
      `INSERT INTO access_log (user_id, action, file_path, ip_address, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      userId == null ? null : userId,
      action,
      filePath || null,
      ipAddress || null,
      Date.now()
    );
}

function queryAccessLog({ userId, limit, offset } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  if (userId) {
    return getDb()
      .prepare(
        `SELECT l.id, l.user_id, u.email, l.action, l.file_path, l.ip_address, l.timestamp
         FROM access_log l
         LEFT JOIN users u ON u.id = l.user_id
         WHERE l.user_id = ?
         ORDER BY l.timestamp DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId, lim, off);
  }
  return getDb()
    .prepare(
      `SELECT l.id, l.user_id, u.email, l.action, l.file_path, l.ip_address, l.timestamp
       FROM access_log l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(lim, off);
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  openDb,
  getDb,
  normalizeEmail,
  findUserByEmail,
  findUserById,
  listUsers,
  setPasswordHash,
  clearPasswordHash,
  setResetToken,
  findUserByResetTokenHash,
  touchLastLogin,
  createSession,
  getSession,
  touchSession,
  deleteSession,
  deleteSessionsForUser,
  pruneExpiredSessions,
  writeAccessLog,
  queryAccessLog,
};
