const db = require("./db");
const kdrive = require("./kdrive");

const SYNC_TTL_MS = 10 * 60 * 1000;
const FOLDER_GAP_MS = 2000;
const FEATURE_EPOCH_MS = Date.parse("2026-10-01T00:00:00+01:00");
let inflight = null;

function pause(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function ensureEpoch() {
  const current = Number(db.getLibraryMeta("library_epoch") || 0);
  const windowEnd = FEATURE_EPOCH_MS + 48 * 60 * 60 * 1000;
  if (!current || (current > FEATURE_EPOCH_MS && current < windowEnd)) {
    db.setLibraryMeta("library_epoch", String(FEATURE_EPOCH_MS));
  }
}

function nodeFromItem(item, parentId, residentVisible) {
  let addedAt = kdrive.addedAtMs(item);
  if (!addedAt && db.getLibraryMeta("library_epoch") && !db.libraryNodeExists(item.id)) {
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

function recordBrowse(folderId, folderName, rawItems, options) {
  ensureEpoch();
  const isRoot = folderId === kdrive.LIBRARY_ROOT_ID;
  db.upsertLibraryNode({
    id: folderId,
    parentId: isRoot ? null : null,
    parentKnown: isRoot,
    name: folderName || (isRoot ? kdrive.LIBRARY_ROOT_NAME : "Folder"),
    type: "dir",
    addedAt: 0,
    residentVisible: !(options && options.residentVisible === false),
  });
  for (const item of rawItems || []) {
    if (!item || !item.id || !item.name || kdrive.isPlaceholder(item.name)) continue;
    const hidden = kdrive.isExcludedLibraryItem(item);
    db.upsertLibraryNode(nodeFromItem(item, folderId, !hidden));
  }
}

async function walkFolder(folderId, inheritedHidden, seenIds) {
  await pause(FOLDER_GAP_MS);
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

function scheduleCatalogSync() {
  if (!kdrive.hasApiToken()) return;
  if (inflight) return;
  const last = Number(db.getLibraryMeta("library_sync_at") || 0);
  if (last && Date.now() - last < SYNC_TTL_MS) return;
  inflight = runSync()
    .catch(function () {
      db.setLibraryMeta("library_sync_at", String(Date.now()));
    })
    .finally(function () {
      inflight = null;
    });
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
  ensureEpoch();
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
  recordBrowse,
  scheduleCatalogSync,
  annotateBrowse,
};
