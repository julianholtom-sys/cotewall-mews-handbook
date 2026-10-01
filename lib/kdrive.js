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

function pause(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function listFolderItems(folderId) {
  const items = [];
  let page = 1;
  let pages = 1;
  while (page <= pages && page <= 20) {
    if (page > 1) await pause(2000);
    const res = await apiFetch(
      `/files/${folderId}/files?per_page=500&page=${page}`
    );
    if (!res.ok) {
      const err = new Error("Could not list the document library");
      err.status = res.status;
      throw err;
    }
    const payload = await res.json();
    const batch = Array.isArray(payload.data) ? payload.data : [];
    items.push.apply(items, batch);
    const reportedPages = Number(payload.pages);
    const total = Number(payload.total);
    if (Number.isInteger(reportedPages) && reportedPages > pages) {
      pages = reportedPages;
    } else if (Number.isFinite(total) && items.length < total) {
      pages = page + 1;
    }
    if (!batch.length) break;
    page += 1;
  }
  return items;
}

function addedAtMs(item) {
  const candidates = [item && item.created_at, item && item.added_at];
  for (const value of candidates) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n > 1e12) return Math.round(n);
    if (n > 1e9) return Math.round(n * 1000);
  }
  return 0;
}

async function listFolder(folderId) {
  const res = await apiFetch(`/files/${folderId}/files?with=capabilities`);
  return res;
}

async function downloadFile(fileId, options) {
  // File bytes are served by API v2. The v3 download route returns method_not_found.
  const convert = options && options.convert;
  const query = convert === "pdf" || convert === "text" ? `?as=${convert}` : "";
  const url = `https://api.infomaniak.com/2/drive/${LIBRARY_DRIVE_ID}/files/${fileId}/download${query}`;
  const request = {
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${KDRIVE_API_TOKEN}`,
      Accept: "*/*",
    },
  };
  let res = await fetch(url, request);
  if (res.status === 429) {
    await pause(2000);
    res = await fetch(url, request);
  }
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
  listFolderItems,
  addedAtMs,
  downloadFile,
  buildPathLabel,
};
