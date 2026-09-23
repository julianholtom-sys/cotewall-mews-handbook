const LIBRARY_DRIVE_ID = process.env.RESIDENT_LIBRARY_DRIVE_ID || "4047143";
const LIBRARY_ROOT_ID = Number(process.env.RESIDENT_LIBRARY_ROOT_ID || 6);
const LIBRARY_ROOT_NAME =
  process.env.RESIDENT_LIBRARY_ROOT_NAME || "Society documents";
const KDRIVE_API_TOKEN = process.env.KDRIVE_API_TOKEN || "";

const LIBRARY_EXCLUDED_IDS = new Set(
  String(
    process.env.RESIDENT_LIBRARY_EXCLUDED_IDS ||
      "14,24,69,74,96,100,104,106"
  )
    .split(",")
    .map(function (part) {
      return Number(String(part).trim());
    })
    .filter(function (id) {
      return Number.isInteger(id) && id > 0;
    })
);

const apiBase = `https://api.infomaniak.com/3/drive/${LIBRARY_DRIVE_ID}`;

function hasApiToken() {
  return Boolean(KDRIVE_API_TOKEN);
}

async function apiFetch(pathname, options) {
  if (!KDRIVE_API_TOKEN) {
    const err = new Error("KDRIVE_API_TOKEN is not configured");
    err.code = "NO_TOKEN";
    throw err;
  }
  const url = `${apiBase}${pathname}`;
  const headers = Object.assign(
    {
      Authorization: `Bearer ${KDRIVE_API_TOKEN}`,
      Accept: "application/json",
    },
    (options && options.headers) || {}
  );
  return fetch(url, Object.assign({}, options || {}, { headers }));
}

function parseFileId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
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
  if (!label) return false;
  if (label.includes("DIGITAL SERVICES") && label.includes("ADMINISTRATION")) {
    return true;
  }
  if (label.includes("BANK STATEMENTS")) return true;
  if (label.includes("DIRECTORS - ORIGINAL STATEMENTS")) return true;
  if (label.includes("CLAIMS") && label.includes("DIRECTORS ONLY")) return true;
  if (label === "DIRECTORS MEETINGS" || label.includes("DIRECTORS MEETINGS")) {
    return true;
  }
  return false;
}

function isExcludedLibraryItem(item) {
  if (!item || !item.id) return true;
  if (LIBRARY_EXCLUDED_IDS.has(Number(item.id))) return true;
  if (item.type === "dir" && isDirectorsOnlyName(item.name)) return true;
  return false;
}

function buildPathLabel(data) {
  const parts = [];
  const parents = Array.isArray(data.parents) ? data.parents.slice().reverse() : [];
  for (const parent of parents) {
    if (parent && parent.name) parts.push(parent.name);
  }
  if (data.name) parts.push(data.name);
  if (data.path && typeof data.path === "string" && data.path.trim()) {
    return data.path.trim();
  }
  return parts.join("/") || String(data.id || "");
}

async function getFileMeta(fileId) {
  const res = await apiFetch(`/files/${fileId}?with=path,parents`);
  if (!res.ok) return null;
  const payload = await res.json();
  return payload.data || null;
}

async function isRestrictedForResident(fileId) {
  if (LIBRARY_EXCLUDED_IDS.has(fileId)) return true;
  const data = await getFileMeta(fileId);
  if (!data) return true;
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

async function assertPathAllowed(user, fileId) {
  if (!user) return { ok: false, path: null };
  if (user.role === "director") {
    const meta = await getFileMeta(fileId);
    return {
      ok: Boolean(meta),
      path: meta ? buildPathLabel(meta) : String(fileId),
      meta,
    };
  }
  const restricted = await isRestrictedForResident(fileId);
  const meta = await getFileMeta(fileId);
  const pathLabel = meta ? buildPathLabel(meta) : String(fileId);
  if (restricted || !meta) {
    return { ok: false, path: pathLabel, meta };
  }
  return { ok: true, path: pathLabel, meta };
}

async function listFolder(folderId) {
  const res = await apiFetch(`/files/${folderId}/files?with=capabilities`);
  return res;
}

async function downloadFile(fileId) {
  const res = await apiFetch(`/files/${fileId}/download`, {
    redirect: "manual",
  });
  return res;
}

module.exports = {
  LIBRARY_DRIVE_ID,
  LIBRARY_ROOT_ID,
  LIBRARY_ROOT_NAME,
  LIBRARY_EXCLUDED_IDS,
  hasApiToken,
  parseFileId,
  mapItem,
  isPlaceholder,
  isExcludedLibraryItem,
  getFileMeta,
  assertPathAllowed,
  listFolder,
  downloadFile,
  buildPathLabel,
};
