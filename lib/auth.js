const crypto = require("crypto");
const bcrypt = require("bcrypt");
const db = require("./db");

const SESSION_COOKIE = "cw_library";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;
const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function clientKey(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(function (part) {
    const trimmed = part.trim();
    if (!trimmed) return;
    const eq = trimmed.indexOf("=");
    if (eq < 1) return;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function requestIsHttps(req) {
  if (req.secure) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "https" || process.env.FORCE_SECURE_COOKIES === "1";
}

function setSessionCookie(req, res, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (requestIsHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(password), hash);
}

function validatePassword(password) {
  const p = String(password || "");
  if (p.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

function createUserSession(req, res, user) {
  db.pruneExpiredSessions(SESSION_TTL_MS);
  const token = crypto.randomBytes(32).toString("hex");
  db.createSession(user.id, hashToken(token));
  setSessionCookie(req, res, token);
  db.touchLastLogin(user.id);
  return token;
}

function destroyRequestSession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) db.deleteSession(hashToken(token));
  clearSessionCookie(res);
}

function getRequestUser(req) {
  db.pruneExpiredSessions(SESSION_TTL_MS);
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = db.getSession(hashToken(token));
  if (!session) return null;
  if (Date.now() - session.last_seen > SESSION_TTL_MS) {
    db.deleteSession(session.token_hash);
    return null;
  }
  db.touchSession(session.token_hash);
  const user = db.findUserById(session.user_id);
  if (!user) {
    db.deleteSession(session.token_hash);
    return null;
  }
  return user;
}

function requireAuth(req, res, next) {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in again." });
  }
  req.libraryUser = user;
  return next();
}

function requireDirector(req, res, next) {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in again." });
  }
  if (user.role !== "director") {
    return res.status(404).json({ error: "Not found." });
  }
  req.libraryUser = user;
  return next();
}

function issueResetToken(user) {
  const raw = crypto.randomBytes(32).toString("hex");
  db.setResetToken(user.id, hashToken(raw), Date.now() + RESET_TTL_MS);
  return raw;
}

function findUserForResetToken(rawToken) {
  if (!rawToken) return null;
  return db.findUserByResetTokenHash(hashToken(rawToken));
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  MIN_PASSWORD_LENGTH,
  clientKey,
  hashPassword,
  verifyPassword,
  validatePassword,
  createUserSession,
  destroyRequestSession,
  getRequestUser,
  requireAuth,
  requireDirector,
  issueResetToken,
  findUserForResetToken,
  hashToken,
  clearSessionCookie,
};
