const db = require("./db");
const kdrive = require("./kdrive");

const SYNC_TTL_MS = 60 * 1000;
let inflight = null;

function nodeFromItem(item, parentId, residentVisible) {
  let addedAt = kdrive.addedAtMs(item);
  if (
    !addedAt &&
    db.getLibraryMeta("library_epoch") &&
    !db.libraryNodeExists(item.id)
  ) {
    addedAt = Date.now();
  }
  return {
    id: item.id,
    parentId: parentId,
    name: item.name,
    type: item.type === "dir" ? "dir" : "file",
    addedAt: addedAt,
    residentVisible: residentVisible,
  };
}

async function walkFolder(folderId, inheritedHidden, seenIds) {
  const items = await kdrive.listFolderItems(folderId);
  for (const item of items) {
    if (!item || !item.id || !item.name || kdrive.isPlaceholder(item.name)) continue;
    const hidden = inheritedHidden || kdrive.isExcludedLibraryItem(item);
    db.upsertLibraryNode(nodeFromItem(item, folderId, !hidden));
    seenIds.add(item.id);
    if (item.type === "dir" && !seenIds.has("walk:" + item.id)) {
      seenIds.add("walk:" + item.id);
      await walkFolder(item.id, hidden, seenIds);
    }
  }
}

async function syncLibraryCatalog(force) {
  if (!kdrive.hasApiToken()) return { ok: false, reason: "no-token" };
  const last = Number(db.getLibraryMeta("library_sync_at") || 0);
  const epoch = db.getLibraryMeta("library_epoch");
  if (!force && epoch && last && Date.now() - last < SYNC_TTL_MS) {
    return { ok: true, cached: true };
  }
  if (inflight) return inflight;
  inflight = runSync().finally(function () {
    inflight = null;
  });
  return inflight;
}

async function runSync() {
  const rootId = kdrive.LIBRARY_ROOT_ID;
  const seenIds = new Set();
  db.upsertLibraryNode({
    id: rootId,
    parentId: null,
    name: kdrive.LIBRARY_ROOT_NAME,
    type: "dir",
    addedAt: 0,
    residentVisible: true,
  });
  seenIds.add(rootId);
  await walkFolder(rootId, false, seenIds);
  const fileIds = new Set();
  for (const id of seenIds) {
    if (typeof id === "number") fileIds.add(id);
  }
  const now = Date.now();
  const stale = db.listLibraryNodeIds().filter(function (id) {
    return !fileIds.has(id);
  });
  db.markLibraryNodesRemoved(stale, now);
  if (!db.getLibraryMeta("library_epoch")) {
    db.setLibraryMeta("library_epoch", String(now));
  }
  db.setLibraryMeta("library_sync_at", String(now));
  return { ok: true, count: fileIds.size };
}

function annotateBrowse(user, items) {
  const director = Boolean(user && user.role === "director");
  const state = db.libraryUnseenState(user.id, director);
  const annotated = items.map(function (item) {
    const unseen =
      item.type === "dir" ? state.folders.has(item.id) : state.files.has(item.id);
    return Object.assign({}, item, { unseen: unseen });
  });
  return {
    items: annotated,
    unseenFolderIds: Array.from(state.folders),
  };
}

module.exports = {
  syncLibraryCatalog,
  annotateBrowse,
};
