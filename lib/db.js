const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const REPO_DATA = path.join(__dirname, "..", "data");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : REPO_DATA;
const DB_PATH = path.join(DATA_DIR, "library.sqlite");
const SEED_PATH = path.join(DATA_DIR, "users-seed.json");
const SEED_EXAMPLE = path.join(DATA_DIR, "users-seed.example.json");
const REPO_SEED = path.join(REPO_DATA, "users-seed.json");
const REPO_SEED_EXAMPLE = path.join(REPO_DATA, "users-seed.example.json");

let db;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  // Keep a durable seed copy beside the sqlite when DATA_DIR is outside the repo.
  if (!fs.existsSync(SEED_PATH)) {
    const from = fs.existsSync(REPO_SEED)
      ? REPO_SEED
      : fs.existsSync(REPO_SEED_EXAMPLE)
        ? REPO_SEED_EXAMPLE
        : null;
    if (from) {
      try {
        fs.copyFileSync(from, SEED_PATH);
      } catch (_) {
        /* ignore */
      }
    }
  }
  // One-time move of existing sqlite out of the git checkout into DATA_DIR.
  if (DATA_DIR !== REPO_DATA && !fs.existsSync(DB_PATH)) {
    const oldDb = path.join(REPO_DATA, "library.sqlite");
    if (fs.existsSync(oldDb)) {
      try {
        fs.copyFileSync(oldDb, DB_PATH);
        for (const suffix of ["-wal", "-shm"]) {
          const side = oldDb + suffix;
          if (fs.existsSync(side)) {
            fs.copyFileSync(side, DB_PATH + suffix);
          }
        }
      } catch (_) {
        /* ignore — fresh DB will be created */
      }
    }
  }
}

function clearAccessLogOnce(database) {
  const flag = path.join(DATA_DIR, ".access-log-cleared");
  if (fs.existsSync(flag)) return;
  database.prepare("DELETE FROM access_log").run();
  fs.writeFileSync(flag, "2026-09-25\n");
}

function clearJulianLibraryTrailOnce(database) {
  const flag = path.join(DATA_DIR, ".julian-library-trail-cleared");
  if (fs.existsSync(flag)) return;
  const user = database
    .prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
    .get("jaholtom@yahoo.co.uk");
  if (user) {
    database.prepare("DELETE FROM access_log WHERE user_id = ?").run(user.id);
    database.prepare("DELETE FROM library_seen WHERE user_id = ?").run(user.id);
    database.prepare("UPDATE users SET last_login = NULL WHERE id = ?").run(user.id);
  }
  fs.writeFileSync(flag, "2026-10-01\n");
}

function openDb() {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedUsers(db);
  clearAccessLogOnce(db);
  clearJulianLibraryTrailOnce(db);
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
  const cols = database.prepare("PRAGMA table_info(users)").all();
  if (!cols.some((col) => col.name === "apartment")) {
    database.exec("ALTER TABLE users ADD COLUMN apartment INTEGER");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS library_nodes (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('dir', 'file')),
      added_at INTEGER NOT NULL,
      resident_visible INTEGER NOT NULL DEFAULT 1,
      removed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_library_nodes_parent ON library_nodes(parent_id);
    CREATE TABLE IF NOT EXISTS library_seen (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_id INTEGER NOT NULL,
      seen_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, file_id)
    );
    CREATE TABLE IF NOT EXISTS library_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
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

function apartmentNumber(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function collectApartments() {
  const map = new Map();
  const files = [SEED_EXAMPLE, REPO_SEED_EXAMPLE, SEED_PATH, REPO_SEED];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(raw)) continue;
      for (const row of raw) {
        const email = normalizeEmail(row.email);
        const apartment = apartmentNumber(row.apartment);
        if (email && apartment != null) map.set(email, apartment);
      }
    } catch (_) {
      /* try next */
    }
  }
  return map;
}

function loadSeedRows() {
  // The committed roster wins. A copy under DATA_DIR is only a fallback,
  // so a role change in the repo is applied on the next start.
  const candidates = [REPO_SEED, REPO_SEED_EXAMPLE, SEED_PATH, SEED_EXAMPLE];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(raw)) continue;
      return raw;
    } catch (_) {
      /* try next */
    }
  }
  return [];
}

function seedUsers(database) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, role, created_at)
    VALUES (@email, NULL, @role, @created_at)
  `);
  const updateRole = database.prepare(`
    UPDATE users SET role = @role WHERE email = @email COLLATE NOCASE
  `);
  const updateApartment = database.prepare(`
    UPDATE users SET apartment = @apartment WHERE email = @email COLLATE NOCASE
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
    for (const [email, apartment] of collectApartments()) {
      updateApartment.run({ email, apartment });
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
      "SELECT id, email, apartment, role, password_hash IS NOT NULL AS has_password, created_at, last_login FROM users ORDER BY apartment IS NULL, apartment, email"
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

function getLibraryMeta(key) {
  const row = getDb()
    .prepare("SELECT value FROM library_meta WHERE key = ?")
    .get(key);
  return row ? row.value : null;
}

function setLibraryMeta(key, value) {
  getDb()
    .prepare(
      `INSERT INTO library_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, String(value));
}

function upsertLibraryNode(node) {
  const parentKnown = node.parentKnown !== false;
  const sql = parentKnown
    ? `INSERT INTO library_nodes
         (id, parent_id, name, type, added_at, resident_visible, removed_at)
       VALUES
         (@id, @parent_id, @name, @type, @added_at, @resident_visible, NULL)
       ON CONFLICT(id) DO UPDATE SET
         parent_id = excluded.parent_id,
         name = excluded.name,
         type = excluded.type,
         resident_visible = excluded.resident_visible,
         removed_at = NULL,
         added_at = CASE
           WHEN library_nodes.added_at = 0 AND excluded.added_at > 0 THEN excluded.added_at
           ELSE library_nodes.added_at
         END`
    : `INSERT INTO library_nodes
         (id, parent_id, name, type, added_at, resident_visible, removed_at)
       VALUES
         (@id, NULL, @name, @type, @added_at, @resident_visible, NULL)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         type = excluded.type,
         resident_visible = excluded.resident_visible,
         removed_at = NULL,
         added_at = CASE
           WHEN library_nodes.added_at = 0 AND excluded.added_at > 0 THEN excluded.added_at
           ELSE library_nodes.added_at
         END`;
  getDb()
    .prepare(sql)
    .run({
      id: node.id,
      parent_id: node.parentId == null ? null : node.parentId,
      name: node.name,
      type: node.type === "dir" ? "dir" : "file",
      added_at: Number(node.addedAt) || 0,
      resident_visible: node.residentVisible ? 1 : 0,
    });
}

function markLibraryNodesRemoved(ids, removedAt) {
  if (!ids.length) return;
  const stmt = getDb().prepare(
    "UPDATE library_nodes SET removed_at = ? WHERE id = ? AND removed_at IS NULL"
  );
  const tx = getDb().transaction(function (list) {
    for (const id of list) stmt.run(removedAt, id);
  });
  tx(ids);
}

function libraryNodeExists(id) {
  return Boolean(
    getDb().prepare("SELECT 1 AS ok FROM library_nodes WHERE id = ?").get(id)
  );
}

function listLibraryNodeIds() {
  return getDb()
    .prepare("SELECT id FROM library_nodes")
    .all()
    .map(function (row) {
      return row.id;
    });
}

function markLibrarySeen(userId, fileId) {
  if (!userId || !fileId) return;
  getDb()
    .prepare(
      `INSERT INTO library_seen (user_id, file_id, seen_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, file_id) DO UPDATE SET seen_at = excluded.seen_at`
    )
    .run(userId, fileId, Date.now());
}

function libraryUnseenState(userId, director) {
  const epoch = Number(getLibraryMeta("library_epoch") || 0);
  const nodes = getDb()
    .prepare(
      `SELECT id, parent_id, type, added_at, resident_visible, removed_at
       FROM library_nodes`
    )
    .all();
  const seenRows = getDb()
    .prepare("SELECT file_id FROM library_seen WHERE user_id = ?")
    .all(userId);
  const seen = new Set(
    seenRows.map(function (row) {
      return row.file_id;
    })
  );
  const byId = new Map();
  for (const node of nodes) byId.set(node.id, node);

  const files = new Set();
  const folders = new Set();
  if (!epoch) return { files: files, folders: folders };

  for (const node of nodes) {
    if (node.removed_at) continue;
    if (node.type !== "file") continue;
    if (!director && !node.resident_visible) continue;
    if (!(node.added_at > epoch)) continue;
    if (seen.has(node.id)) continue;
    files.add(node.id);
    let parentId = node.parent_id;
    const guard = new Set();
    while (parentId && !guard.has(parentId)) {
      guard.add(parentId);
      const parent = byId.get(parentId);
      if (!parent || parent.removed_at) break;
      if (!director && !parent.resident_visible) break;
      folders.add(parentId);
      parentId = parent.parent_id;
    }
  }
  return { files: files, folders: folders };
}

function queryAccessLog({ userId, limit, offset } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  if (userId) {
    return getDb()
      .prepare(
        `SELECT l.id, l.user_id, u.email, u.apartment, l.action, l.file_path, l.ip_address, l.timestamp
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
      `SELECT l.id, l.user_id, u.email, u.apartment, l.action, l.file_path, l.ip_address, l.timestamp
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
  getLibraryMeta,
  setLibraryMeta,
  upsertLibraryNode,
  markLibraryNodesRemoved,
  libraryNodeExists,
  listLibraryNodeIds,
  markLibrarySeen,
  libraryUnseenState,
};
