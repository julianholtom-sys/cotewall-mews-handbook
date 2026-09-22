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

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

const LIBRARY_URL =
  process.env.RESIDENT_LIBRARY_URL ||
  "https://kdrive.infomaniak.com/app/share/4047143/e81fda38-3555-43b0-bfab-2b9eed9a7d20";
const LIBRARY_PASSWORD = process.env.RESIDENT_LIBRARY_PASSWORD || "";

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
  return res.json({ url: LIBRARY_URL });
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Cotewall Mews handbook → http://localhost:${PORT}`);
});
