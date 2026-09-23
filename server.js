const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
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

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

const LIBRARY_PASSWORD = process.env.RESIDENT_LIBRARY_PASSWORD || "";
const LIBRARY_DRIVE_ID = process.env.RESIDENT_LIBRARY_DRIVE_ID || "4047143";
const LIBRARY_SHARE_UUID =
  process.env.RESIDENT_LIBRARY_SHARE_UUID ||
  "60945e17-1111-4f92-90c3-185f6ff51d5c";
const LIBRARY_ROOT_ID = Number(process.env.RESIDENT_LIBRARY_ROOT_ID || 6);
const LIBRARY_ROOT_NAME =
  process.env.RESIDENT_LIBRARY_ROOT_NAME || "Society documents";
/** Directors-only: Digital Services & Administration (default folder id 14). */
const LIBRARY_EXCLUDED_IDS = new Set(
  String(process.env.RESIDENT_LIBRARY_EXCLUDED_IDS || "14")
    .split(",")
    .map(function (part) {
      return Number(String(part).trim());
    })
    .filter(function (id) {
      return Number.isInteger(id) && id > 0;
    })
);
const SESSION_COOKIE = "cw_library";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

const shareBase = `https://kdrive.infomaniak.com/2/app/${LIBRARY_DRIVE_ID}/share/${LIBRARY_SHARE_UUID}`;

const sessions = new Map();
const failCounts = new Map();
const FAIL_LIMIT = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

function clientKey(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

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

function pruneSessions() {
  const now = Date.now();
  for (const [token, exp] of sessions) {
    if (exp <= now) sessions.delete(token);
  }
}

function createSession() {
  pruneSessions();
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function hasValidSession(req) {
  pruneSessions();
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
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

function requireLibrarySession(req, res, next) {
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "Library session expired. Please enter the password again." });
  }
  return next();
}

function parseFileId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

async function shareFetch(pathname) {
  const url = `${shareBase}${pathname}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "manual",
  });
  return response;
}

function mapItem(item) {
  return {
    id: item.id,
    name: item.name,
    type: item.type === "dir" ? "dir" : "file",
    size: item.size || null,
    mime: item.mime_type || null,
  };
}

function isPlaceholder(name) {
  return name === ".keep" || name === ".DS_Store" || name === "Thumbs.db";
}

function normalizeFolderLabel(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function isDirectorsOnlyName(name) {
  const label = normalizeFolderLabel(name);
  return (
    label.includes("DIGITAL SERVICES") && label.includes("ADMINISTRATION")
  );
}

function isExcludedLibraryItem(item) {
  if (!item || !item.id) return true;
  if (LIBRARY_EXCLUDED_IDS.has(Number(item.id))) return true;
  if (item.type === "dir" && isDirectorsOnlyName(item.name)) return true;
  return false;
}

async function isDirectorsOnlyPath(fileId) {
  if (LIBRARY_EXCLUDED_IDS.has(fileId)) return true;
  const metaRes = await shareFetch(`/files/${fileId}?with=path,parents`);
  if (!metaRes.ok) return true;
  const meta = await metaRes.json();
  const data = meta.data || {};
  if (isDirectorsOnlyName(data.name)) return true;
  if (isDirectorsOnlyName(data.path)) return true;
  const parents = Array.isArray(data.parents) ? data.parents : [];
  for (const parent of parents) {
    if (!parent) continue;
    if (LIBRARY_EXCLUDED_IDS.has(Number(parent.id))) return true;
    if (isDirectorsOnlyName(parent.name)) return true;
  }
  return false;
}

app.use(express.json({ limit: "4kb" }));
app.use(express.urlencoded({ extended: false, limit: "4kb" }));
app.use(express.static(publicDir, { extensions: ["html"] }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/api/library-access", (req, res) => {
  const key = clientKey(req);
  if (tooManyFailures(key)) {
    return res.status(429).json({
      error: "Too many incorrect attempts. Please try again later.",
    });
  }

  if (!LIBRARY_PASSWORD) {
    return res.status(503).json({
      error:
        "The library password is not configured on the server yet. Please contact the Directors.",
    });
  }

  const submitted = String(req.body?.password || "");
  if (submitted !== LIBRARY_PASSWORD) {
    recordFailure(key);
    return res.status(401).json({ error: "Incorrect password." });
  }

  failCounts.delete(key);
  const token = createSession();
  setSessionCookie(req, res, token);
  return res.json({ ok: true, rootId: LIBRARY_ROOT_ID, rootName: LIBRARY_ROOT_NAME });
});

app.get("/api/library/session", (req, res) => {
  if (!hasValidSession(req)) {
    return res.status(401).json({ ok: false });
  }
  return res.json({ ok: true, rootId: LIBRARY_ROOT_ID, rootName: LIBRARY_ROOT_NAME });
});

app.post("/api/library/logout", (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.get("/api/library/browse", requireLibrarySession, async (req, res) => {
  const folderId = parseFileId(req.query.id) || LIBRARY_ROOT_ID;
  try {
    if (
      folderId !== LIBRARY_ROOT_ID &&
      (await isDirectorsOnlyPath(folderId))
    ) {
      return res
        .status(404)
        .json({ error: "Folder not found in the Residents library." });
    }

    const listRes = await shareFetch(
      `/files/${folderId}/files?with=capabilities`
    );
    if (listRes.status === 401 || listRes.status === 403 || listRes.status === 404) {
      return res.status(404).json({ error: "Folder not found in the Residents library." });
    }
    if (!listRes.ok) {
      return res.status(502).json({ error: "Could not load the library just now. Please try again." });
    }
    const payload = await listRes.json();
    const items = Array.isArray(payload.data) ? payload.data : [];
    const mapped = items
      .filter(
        (item) =>
          item &&
          item.name &&
          !isPlaceholder(item.name) &&
          !isExcludedLibraryItem(item)
      )
      .map(mapItem)
      .sort(function (a, b) {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      });

    let folderName = LIBRARY_ROOT_NAME;
    if (folderId !== LIBRARY_ROOT_ID) {
      const metaRes = await shareFetch(`/files/${folderId}`);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta.data && meta.data.name) folderName = meta.data.name;
      }
    }

    return res.json({
      id: folderId,
      name: folderName,
      parentId: folderId === LIBRARY_ROOT_ID ? null : LIBRARY_ROOT_ID,
      rootId: LIBRARY_ROOT_ID,
      items: mapped,
    });
  } catch (_) {
    return res.status(502).json({ error: "Could not reach the document library." });
  }
});

app.get("/api/library/download/:id", requireLibrarySession, async (req, res) => {
  const fileId = parseFileId(req.params.id);
  if (!fileId) {
    return res.status(400).json({ error: "Invalid file." });
  }
  try {
    if (await isDirectorsOnlyPath(fileId)) {
      return res
        .status(404)
        .json({ error: "File not found in the Residents library." });
    }

    const metaRes = await shareFetch(`/files/${fileId}`);
    if (!metaRes.ok) {
      return res.status(404).json({ error: "File not found in the Residents library." });
    }
    const meta = await metaRes.json();
    const name = (meta.data && meta.data.name) || "download";

    const dlRes = await shareFetch(`/files/${fileId}/download`);
    if (dlRes.status >= 300 && dlRes.status < 400) {
      const location = dlRes.headers.get("location");
      if (location) {
        res.setHeader("Cache-Control", "no-store");
        return res.redirect(302, location);
      }
    }
    if (!dlRes.ok) {
      return res.status(502).json({ error: "Download is not available right now." });
    }

    const contentType = dlRes.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
    );
    res.setHeader("Cache-Control", "no-store");
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    return res.send(buffer);
  } catch (_) {
    return res.status(502).json({ error: "Could not download that file." });
  }
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Cotewall Mews handbook → http://localhost:${PORT}`);
});
