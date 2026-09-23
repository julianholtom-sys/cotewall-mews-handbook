const path = require("path");
const fs = require("fs");
const express = require("express");

// Load local .env if present (Infomaniak can also set these as real env vars).
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eq = trimmed.indexOf("=");
        if (eq < 1) return;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = val;
      });
  }
} catch (_) {
  /* ignore */
}

const db = require("./lib/db");
const auth = require("./lib/auth");
const kdrive = require("./lib/kdrive");
const mail = require("./lib/mail");

db.openDb();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const APP_BASE_URL = (
  process.env.APP_BASE_URL || "https://cotewall-mews.ltd"
).replace(/\/$/, "");

const failCounts = new Map();
const FAIL_LIMIT = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const GENERIC_LOGIN_REJECT =
  "That email is not registered for the document library.";
const GENERIC_FORGOT_MSG =
  "If that address is registered, a reset link has been sent.";

function tooManyFailures(key) {
  const now = Date.now();
  const entry = failCounts.get(key);
  if (!entry) return false;
  if (now - entry.start > FAIL_WINDOW_MS) {
    failCounts.delete(key);
    return false;
  }
  return entry.count >= FAIL_LIMIT;
}

function recordFailure(key) {
  const now = Date.now();
  const entry = failCounts.get(key);
  if (!entry || now - entry.start > FAIL_WINDOW_MS) {
    failCounts.set(key, { start: now, count: 1 });
    return;
  }
  entry.count += 1;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

function sessionPayload(user) {
  return {
    ok: true,
    rootId: kdrive.LIBRARY_ROOT_ID,
    rootName: kdrive.LIBRARY_ROOT_NAME,
    user: publicUser(user),
  };
}

app.use(express.json({ limit: "8kb" }));
app.use(express.urlencoded({ extended: false, limit: "8kb" }));
app.use(express.static(publicDir, { extensions: ["html"] }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/library-log", (_req, res) => {
  res.sendFile(path.join(publicDir, "library-log.html"));
});

app.get("/library-reset", (_req, res) => {
  res.sendFile(path.join(publicDir, "library-reset.html"));
});

app.get("/api/library/health", (_req, res) => {
  return res.json({
    ok: true,
    kdrive: Boolean(process.env.KDRIVE_API_TOKEN),
    smtp: mail.smtpConfigured(),
    dataDir: process.env.DATA_DIR || null,
  });
});

app.get("/api/library/session", (req, res) => {
  const user = auth.getRequestUser(req);
  if (!user) {
    return res.status(401).json({ ok: false });
  }
  return res.json(sessionPayload(user));
});

app.post("/api/library/logout", (req, res) => {
  auth.destroyRequestSession(req, res);
  return res.json({ ok: true });
});

app.post("/api/library/login", (req, res) => {
  const key = auth.clientKey(req);
  if (tooManyFailures(key)) {
    return res.status(429).json({
      error: "Too many incorrect attempts. Please try again later.",
    });
  }

  const email = db.normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: "Enter your email address." });
  }

  const user = db.findUserByEmail(email);
  if (!user) {
    recordFailure(key);
    db.writeAccessLog({
      userId: null,
      action: "failed_login",
      filePath: email,
      ipAddress: key,
    });
    return res.status(401).json({ error: GENERIC_LOGIN_REJECT });
  }

  failCounts.delete(key);
  if (!user.password_hash) {
    return res.json({ status: "need_set_password", email: user.email });
  }
  return res.json({ status: "need_password", email: user.email });
});

app.post("/api/library/password", async (req, res) => {
  const key = auth.clientKey(req);
  if (tooManyFailures(key)) {
    return res.status(429).json({
      error: "Too many incorrect attempts. Please try again later.",
    });
  }

  const email = db.normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const user = db.findUserByEmail(email);

  if (!user) {
    recordFailure(key);
    db.writeAccessLog({
      userId: null,
      action: "failed_login",
      filePath: email || null,
      ipAddress: key,
    });
    return res.status(401).json({ error: GENERIC_LOGIN_REJECT });
  }

  try {
    if (!user.password_hash) {
      const invalid = auth.validatePassword(password);
      if (invalid) {
        return res.status(400).json({ error: invalid });
      }
      const hash = await auth.hashPassword(password);
      db.setPasswordHash(user.id, hash);
      auth.createUserSession(req, res, user);
      db.writeAccessLog({
        userId: user.id,
        action: "login",
        ipAddress: key,
      });
      failCounts.delete(key);
      return res.json(sessionPayload(user));
    }

    const ok = await auth.verifyPassword(password, user.password_hash);
    if (!ok) {
      recordFailure(key);
      db.writeAccessLog({
        userId: user.id,
        action: "failed_login",
        ipAddress: key,
      });
      return res.status(401).json({ error: "Incorrect password." });
    }

    auth.createUserSession(req, res, user);
    db.writeAccessLog({
      userId: user.id,
      action: "login",
      ipAddress: key,
    });
    failCounts.delete(key);
    return res.json(sessionPayload(user));
  } catch (_) {
    return res.status(500).json({ error: "Could not complete sign-in." });
  }
});

app.post("/api/library/forgot", async (req, res) => {
  const email = db.normalizeEmail(req.body?.email);
  const user = email ? db.findUserByEmail(email) : null;

  if (user) {
    try {
      const raw = auth.issueResetToken(user);
      const resetUrl = `${APP_BASE_URL}/library-reset?token=${encodeURIComponent(raw)}`;
      await mail.sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      if (err && err.code === "NO_SMTP") {
        console.error("Password reset requested but SMTP is not configured");
      } else {
        console.error("Password reset email failed", err && err.message);
      }
    }
  }

  return res.json({ ok: true, message: GENERIC_FORGOT_MSG });
});

app.post("/api/library/reset", async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  const user = auth.findUserForResetToken(token);
  if (!user) {
    return res.status(400).json({
      error: "This reset link is invalid or has expired. Please request a new one.",
    });
  }

  const invalid = auth.validatePassword(password);
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  try {
    const hash = await auth.hashPassword(password);
    db.setPasswordHash(user.id, hash);
    db.deleteSessionsForUser(user.id);
    db.writeAccessLog({
      userId: user.id,
      action: "password_reset",
      ipAddress: auth.clientKey(req),
    });
    return res.json({ ok: true });
  } catch (_) {
    return res.status(500).json({ error: "Could not update the password." });
  }
});

app.get("/api/library/browse", auth.requireAuth, async (req, res) => {
  if (!kdrive.hasApiToken()) {
    return res.status(503).json({
      error:
        "Document library storage is not configured yet. Please contact the Directors.",
    });
  }

  const folderId = kdrive.parseFileId(req.query.id) || kdrive.LIBRARY_ROOT_ID;
  const user = req.libraryUser;
  const ip = auth.clientKey(req);

  try {
    const allowed = await kdrive.assertPathAllowed(user, folderId);
    if (!allowed.ok) {
      if (user.role !== "director") {
        db.writeAccessLog({
          userId: user.id,
          action: "view",
          filePath: allowed.path || String(folderId),
          ipAddress: ip,
        });
      }
      return res
        .status(404)
        .json({ error: "Folder not found in the document library." });
    }

    const listRes = await kdrive.listFolder(folderId);
    if (
      listRes.status === 401 ||
      listRes.status === 403 ||
      listRes.status === 404
    ) {
      return res
        .status(404)
        .json({ error: "Folder not found in the document library." });
    }
    if (!listRes.ok) {
      return res
        .status(502)
        .json({ error: "Could not load the library just now. Please try again." });
    }

    const payload = await listRes.json();
    const items = Array.isArray(payload.data) ? payload.data : [];
    const mapped = items
      .filter(function (item) {
        if (!item || !item.name || kdrive.isPlaceholder(item.name)) return false;
        if (user.role === "director") return true;
        return !kdrive.isExcludedLibraryItem(item);
      })
      .map(kdrive.mapItem)
      .sort(function (a, b) {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      });

    let folderName = kdrive.LIBRARY_ROOT_NAME;
    if (folderId !== kdrive.LIBRARY_ROOT_ID && allowed.meta && allowed.meta.name) {
      folderName = allowed.meta.name;
    }

    return res.json({
      id: folderId,
      name: folderName,
      parentId: folderId === kdrive.LIBRARY_ROOT_ID ? null : kdrive.LIBRARY_ROOT_ID,
      rootId: kdrive.LIBRARY_ROOT_ID,
      items: mapped,
    });
  } catch (err) {
    if (err && err.code === "NO_TOKEN") {
      return res.status(503).json({
        error:
          "Document library storage is not configured yet. Please contact the Directors.",
      });
    }
    return res
      .status(502)
      .json({ error: "Could not reach the document library." });
  }
});

async function serveLibraryFile(req, res) {
  if (!kdrive.hasApiToken()) {
    return res.status(503).json({
      error:
        "Document library storage is not configured yet. Please contact the Directors.",
    });
  }

  const fileId =
    kdrive.parseFileId(req.params.id) || kdrive.parseFileId(req.query.id);
  if (!fileId) {
    return res.status(400).json({ error: "Invalid file." });
  }

  const user = req.libraryUser;
  const ip = auth.clientKey(req);
  const disposition =
    String(req.query.disposition || "").toLowerCase() === "inline"
      ? "inline"
      : "attachment";

  try {
    const allowed = await kdrive.assertPathAllowed(user, fileId);
    if (!allowed.ok || !allowed.meta || allowed.meta.type === "dir") {
      db.writeAccessLog({
        userId: user.id,
        action: disposition === "inline" ? "view" : "download",
        filePath: allowed.path || String(fileId),
        ipAddress: ip,
      });
      return res
        .status(404)
        .json({ error: "File not found in the document library." });
    }

    const name = allowed.meta.name || "download";
    const pathLabel = allowed.path || name;

    let dlRes = await kdrive.downloadFile(fileId);
    if (dlRes.status >= 300 && dlRes.status < 400) {
      const location = dlRes.headers.get("location");
      if (location) {
        dlRes = await fetch(location, { redirect: "follow" });
      }
    }
    if (!dlRes.ok) {
      return res
        .status(502)
        .json({ error: "Download is not available right now." });
    }

    db.writeAccessLog({
      userId: user.id,
      action: disposition === "inline" ? "view" : "download",
      filePath: pathLabel,
      ipAddress: ip,
    });

    const contentType =
      dlRes.headers.get("content-type") ||
      allowed.meta.mime_type ||
      "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`
    );
    res.setHeader("Cache-Control", "no-store");
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    if (err && err.code === "NO_TOKEN") {
      return res.status(503).json({
        error:
          "Document library storage is not configured yet. Please contact the Directors.",
      });
    }
    return res.status(502).json({ error: "Could not download that file." });
  }
}

app.get("/api/library/file", auth.requireAuth, serveLibraryFile);
app.get("/api/library/file/:id", auth.requireAuth, serveLibraryFile);
app.get("/file", auth.requireAuth, serveLibraryFile);
app.get("/api/library/download/:id", auth.requireAuth, serveLibraryFile);

app.get("/api/library/log", auth.requireDirector, (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const rows = db.queryAccessLog({
    userId: Number.isInteger(userId) && userId > 0 ? userId : null,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  return res.json({ ok: true, items: rows });
});

app.get("/api/library/users", auth.requireDirector, (_req, res) => {
  return res.json({ ok: true, users: db.listUsers() });
});

app.post(
  "/api/library/users/:id/clear-password",
  auth.requireDirector,
  (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid user." });
    }
    const target = db.findUserById(id);
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }
    db.clearPasswordHash(id);
    db.deleteSessionsForUser(id);
    return res.json({ ok: true });
  }
);

app.use((_req, res) => {
  res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Cotewall Mews handbook → http://localhost:${PORT}`);
});
