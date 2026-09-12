// features.js: read-later archive, time tracking, focus mode,
// markdown export, tab hygiene scoring, message router.

// ---- Read-later archive ----
// The reason tabs pile up is that closing one feels like losing it. Archiving
// closes the tab but keeps the title and URL, so "close" stops being
// destructive and the count actually goes down.
const ARCHIVE_KEY = "stax_archive";
const ARCHIVE_CAP = 500;

async function archiveTabs(tabIds, reason = "manual") {
  const tabs = await chrome.tabs.query({});
  const wanted = tabs.filter(t => tabIds.includes(t.id) && t.url && !/^(chrome|chrome-extension|brave|edge|edge-extension|moz-extension|about|file):/.test(t.url));
  if (!wanted.length) return { ok: false, error: "no-valid-tabs" };

  try {
    const { [ARCHIVE_KEY]: archive = [] } = await chrome.storage.local.get([ARCHIVE_KEY]);
    const existing = new Set(archive.map(a => normalizeUrl(a.url)));

    for (const t of wanted) {
      const key = normalizeUrl(t.url);
      if (existing.has(key)) continue; // already saved, no point storing it twice
      existing.add(key);
      archive.push({ id: `${Date.now()}-${t.id}`, url: t.url, title: t.title || t.url, archivedAt: Date.now(), reason });
    }

    // Oldest entries fall off the end rather than letting this grow forever.
    const trimmed = archive.slice(-ARCHIVE_CAP);
    await chrome.storage.local.set({ [ARCHIVE_KEY]: trimmed });

    // Snapshot into the undo store before closing, same as dedupe, so a
    // mis-click is recoverable for the usual two minutes.
    const records = wanted.map(t => ({ url: t.url, title: t.title || "" }));
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.tabs.remove(wanted.map(t => t.id));
    await recordLastAction({ type: "dedupe", windowId: activeTab?.windowId, removedTabs: records });

    return { ok: true, archived: wanted.length };
  } catch (err) {
    console.warn("Stax: archiveTabs failed", err);
    return { ok: false, error: "storage-failed" };
  }
}

// Archives tabs nothing has touched in a while. Unlike suspend, this closes
// things, so a tab with no recorded activity is SKIPPED rather than assumed
// stale: suspending a tab you misjudged is free, closing one is not.
async function archiveStaleTabs(windowId, days = 7) {
  const thresholdMs = days * 24 * 60 * 60 * 1000;
  const tabs = await chrome.tabs.query({ windowId, pinned: false, active: false, audible: false });
  let tabLastActive = {};
  try {
    ({ tabLastActive = {} } = await chrome.storage.session.get(["tabLastActive"]));
  } catch (err) {
    return { ok: false, error: "no-activity-data" };
  }

  const now = Date.now();
  const stale = tabs.filter(t => {
    const last = tabLastActive[t.id];
    if (!last) return false; // never seen it active, so don't gamble on closing it
    return now - last >= thresholdMs;
  }).map(t => t.id);

  if (!stale.length) return { ok: true, archived: 0 };
  return archiveTabs(stale, `stale-${days}d`);
}

async function listArchive() {
  const { [ARCHIVE_KEY]: archive = [] } = await chrome.storage.local.get([ARCHIVE_KEY]);
  return archive.slice().sort((a, b) => b.archivedAt - a.archivedAt);
}

async function restoreArchived(id, { keep = false } = {}) {
  const { [ARCHIVE_KEY]: archive = [] } = await chrome.storage.local.get([ARCHIVE_KEY]);
  const entry = archive.find(a => a.id === id);
  if (!entry) return { ok: false, error: "not-found" };
  await chrome.tabs.create({ url: entry.url, active: true });
  // Reopening usually means you're done with the saved copy, but keep is
  // there for reference material you want to hold onto.
  if (!keep) await chrome.storage.local.set({ [ARCHIVE_KEY]: archive.filter(a => a.id !== id) });
  return { ok: true };
}

async function deleteArchived(id) {
  const { [ARCHIVE_KEY]: archive = [] } = await chrome.storage.local.get([ARCHIVE_KEY]);
  await chrome.storage.local.set({ [ARCHIVE_KEY]: archive.filter(a => a.id !== id) });
  return { ok: true };
}

async function clearArchive() {
  await chrome.storage.local.set({ [ARCHIVE_KEY]: [] });
  return { ok: true };
}

// ---- Time tracking ----
// Accumulates active-tab time per category per day, entirely locally. The
// "currently being timed" marker lives in storage.session because an MV3
// worker is killed constantly and an in-memory timestamp would vanish with
// it, silently losing every stretch of time between restarts.
const TIME_STATS_KEY = "stax_time_stats";
const TIME_KEEP_DAYS = 21;
const TIME_MIN_SLICE_MS = 3000;   // ignore fly-through tab switches
const TIME_MAX_SLICE_MS = 30 * 60 * 1000; // a slice longer than this means the machine slept

function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function flushTimeSlice() {
  try {
    const { staxTimer } = await chrome.storage.session.get(["staxTimer"]);
    if (!staxTimer?.category || !staxTimer.since) return;

    const elapsed = Date.now() - staxTimer.since;
    // Both guards matter: the lower one keeps rapid switching out of the
    // stats, the upper one stops an overnight sleep counting as 9 hours.
    if (elapsed < TIME_MIN_SLICE_MS || elapsed > TIME_MAX_SLICE_MS) return;

    const { [TIME_STATS_KEY]: stats = {} } = await chrome.storage.local.get([TIME_STATS_KEY]);
    const day = dayKey(staxTimer.since);
    stats[day] = stats[day] || {};
    stats[day][staxTimer.category] = (stats[day][staxTimer.category] || 0) + elapsed;

    // Prune old days so this can't grow without bound.
    const cutoff = dayKey(Date.now() - TIME_KEEP_DAYS * 24 * 60 * 60 * 1000);
    Object.keys(stats).forEach(d => { if (d < cutoff) delete stats[d]; });

    await chrome.storage.local.set({ [TIME_STATS_KEY]: stats });
  } catch (err) {
    console.warn("Stax: flushTimeSlice failed", err);
  }
}

async function startTimingTab(tab) {
  await flushTimeSlice();
  if (!tab?.url) return;
  try {
    const rules = await getAllRules();
    const cat = await getCategoryForTab(tab.url, rules, tab.title);
    await chrome.storage.session.set({
      staxTimer: { category: cat?.name || "Uncategorised", since: Date.now() }
    });
  } catch (err) {
    console.warn("Stax: startTimingTab failed", err);
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { await startTimingTab(await chrome.tabs.get(tabId)); } catch { /* tab already gone */ }
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // A navigation inside the same tab can change its category, so re-time it.
  if (changeInfo.status === "complete" && tab.active) await startTimingTab(tab);
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus: bank what we have rather than counting time spent
    // in another application.
    await flushTimeSlice();
    await chrome.storage.session.remove(["staxTimer"]).catch(() => {});
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) await startTimingTab(tab);
  } catch { /* window closed */ }
});

async function getTimeStats(days = 7) {
  await flushTimeSlice(); // include the stretch in progress so today looks right
  const { [TIME_STATS_KEY]: stats = {} } = await chrome.storage.local.get([TIME_STATS_KEY]);

  const totals = {};
  const perDay = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(Date.now() - i * 24 * 60 * 60 * 1000);
    const day = stats[key] || {};
    let dayTotal = 0;
    Object.entries(day).forEach(([cat, ms]) => {
      totals[cat] = (totals[cat] || 0) + ms;
      dayTotal += ms;
    });
    perDay.push({ day: key, total: dayTotal });
  }

  const ranked = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([category, ms]) => ({ category, ms }));

  return { ok: true, totals: ranked, perDay, grandTotal: ranked.reduce((n, r) => n + r.ms, 0) };
}

async function resetTimeStats() {
  await chrome.storage.local.set({ [TIME_STATS_KEY]: {} });
  await chrome.storage.session.remove(["staxTimer"]).catch(() => {});
  return { ok: true };
}

// ---- Focus mode ----
// Collapses every group except the one holding the active tab, and optionally
// suspends the tabs in those groups too. Stores what it collapsed so exiting
// restores the previous state rather than just expanding everything.
const FOCUS_KEY = "stax_focus";

async function enterFocusMode(windowId, { suspendOthers = false } = {}) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (!activeTab) return { ok: false, error: "no-active-tab" };

  const keepGroupId = activeTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? activeTab.groupId : null;
  const groups = await chrome.tabGroups.query({ windowId });

  const previouslyCollapsed = groups.filter(g => g.collapsed).map(g => g.id);
  const toCollapse = groups.filter(g => g.id !== keepGroupId && !g.collapsed);

  for (const g of toCollapse) {
    try { await chrome.tabGroups.update(g.id, { collapsed: true }); } catch { /* group vanished */ }
  }

  let suspended = 0;
  if (suspendOthers) {
    const others = await chrome.tabs.query({ windowId, pinned: false, active: false, audible: false, discarded: false });
    for (const t of others) {
      if (keepGroupId && t.groupId === keepGroupId) continue;
      try { await chrome.tabs.discard(t.id); suspended++; } catch { /* can't discard */ }
    }
  }

  await chrome.storage.session.set({
    [FOCUS_KEY]: { windowId, keepGroupId, previouslyCollapsed, collapsed: toCollapse.map(g => g.id) }
  });
  return { ok: true, collapsed: toCollapse.length, suspended };
}

async function exitFocusMode(windowId) {
  const { [FOCUS_KEY]: state } = await chrome.storage.session.get([FOCUS_KEY]);
  if (!state) return { ok: false, error: "not-in-focus" };

  for (const id of state.collapsed) {
    // Anything the user already had collapsed before focus mode stays that
    // way; only expand what focus mode itself collapsed.
    if (state.previouslyCollapsed.includes(id)) continue;
    try { await chrome.tabGroups.update(id, { collapsed: false }); } catch { /* gone */ }
  }
  await chrome.storage.session.remove([FOCUS_KEY]);
  return { ok: true };
}

async function getFocusState() {
  const { [FOCUS_KEY]: state } = await chrome.storage.session.get([FOCUS_KEY]);
  return { active: !!state, windowId: state?.windowId ?? null };
}

// ---- Markdown export ----
// Built here rather than in the popup so it can see group membership, and
// returned as a string for the popup to put on the clipboard.
async function exportWindowMarkdown(windowId) {
  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  const groups = await chrome.tabGroups.query({ windowId });
  const groupById = new Map(groups.map(g => [g.id, g]));

  const usable = tabs.filter(t => t.url && !/^(chrome|chrome-extension|brave|edge|edge-extension|moz-extension|about|file):/.test(t.url));
  if (!usable.length) return { ok: false, error: "no-tabs" };

  const buckets = new Map();
  for (const t of usable) {
    const g = t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? groupById.get(t.groupId) : null;
    const key = g?.title || "Ungrouped";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }

  const lines = [`# Tabs, ${new Date().toLocaleDateString()}`, ""];
  // Ungrouped last: the named groups are the part worth reading first.
  const keys = [...buckets.keys()].sort((a, b) =>
    a === "Ungrouped" ? 1 : b === "Ungrouped" ? -1 : a.localeCompare(b));

  for (const key of keys) {
    lines.push(`## ${key}`);
    for (const t of buckets.get(key)) {
      // Escape ] so a bracket in a page title can't break the link syntax.
      const title = (t.title || t.url).replace(/\]/g, "\\]");
      lines.push(`- [${title}](${t.url})`);
    }
    lines.push("");
  }

  return { ok: true, markdown: lines.join("\n"), count: usable.length };
}

// ---- Tab hygiene, for Stacklet's mood ----
async function getTabHygiene(windowId) {
  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  const groups = await chrome.tabGroups.query({ windowId });
  const grouped = tabs.filter(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).length;

  let mood = "happy";
  if (tabs.length >= 60) mood = "buried";
  else if (tabs.length >= 35) mood = "stressed";
  else if (tabs.length >= 15) mood = "neutral";

  return {
    ok: true,
    tabCount: tabs.length,
    groupCount: groups.length,
    groupedRatio: tabs.length ? grouped / tabs.length : 1,
    mood
  };
}

// ---- Message routing for everything added above ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "UNDO_LAST_ACTION") {
    undoLastAction().then(sendResponse);
    return true;
  }
  if (msg.type === "GET_UNDO_STATE") {
    getUndoableAction().then(action => sendResponse({ available: !!action, type: action?.type || null }));
    return true;
  }
  if (msg.type === "TOGGLE_GROUP_COLLAPSE") {
    toggleGroupCollapse(msg.groupId).then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === "RENAME_GROUP") {
    renameGroup(msg.groupId, msg.title).then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === "MOVE_GROUP_TO_NEW_WINDOW") {
    moveGroupToNewWindow(msg.groupId).then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === "JUMP_TO_TAB") {
    jumpToTab(msg.tabId).then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === "SAVE_SESSION") {
    saveSession(msg.windowId, msg.name).then(sendResponse);
    return true;
  }
  if (msg.type === "LIST_SESSIONS") {
    listSessions().then(sessions => sendResponse({ ok: true, sessions }));
    return true;
  }
  if (msg.type === "RESTORE_SESSION") {
    restoreSession(msg.id).then(sendResponse);
    return true;
  }
  if (msg.type === "DELETE_SESSION") {
    deleteSession(msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "SUSPEND_INACTIVE") {
    suspendInactiveTabs(msg.windowId).then(count => sendResponse({ ok: true, suspended: count }));
    return true;
  }
  if (msg.type === "AI_SEARCH_TABS") {
    aiSearchTabs(msg.windowId, msg.query).then(sendResponse);
    return true;
  }
  if (msg.type === "STACKLET_CHAT") {
    stackletChat(msg.windowId, msg.message, msg.history).then(sendResponse);
    return true;
  }
  if (msg.type === "STACKLET_RUN_ACTION") {
    runStackletAction(msg.action, msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "ARCHIVE_TABS") {
    archiveTabs(msg.tabIds, msg.reason).then(sendResponse);
    return true;
  }
  if (msg.type === "ARCHIVE_STALE") {
    archiveStaleTabs(msg.windowId, msg.days).then(sendResponse);
    return true;
  }
  if (msg.type === "LIST_ARCHIVE") {
    listArchive().then(items => sendResponse({ ok: true, items }));
    return true;
  }
  if (msg.type === "RESTORE_ARCHIVED") {
    restoreArchived(msg.id, { keep: msg.keep }).then(sendResponse);
    return true;
  }
  if (msg.type === "DELETE_ARCHIVED") {
    deleteArchived(msg.id).then(sendResponse);
    return true;
  }
  if (msg.type === "CLEAR_ARCHIVE") {
    clearArchive().then(sendResponse);
    return true;
  }
  if (msg.type === "GET_TIME_STATS") {
    getTimeStats(msg.days).then(sendResponse);
    return true;
  }
  if (msg.type === "RESET_TIME_STATS") {
    resetTimeStats().then(sendResponse);
    return true;
  }
  if (msg.type === "ENTER_FOCUS") {
    enterFocusMode(msg.windowId, { suspendOthers: msg.suspendOthers }).then(sendResponse);
    return true;
  }
  if (msg.type === "EXIT_FOCUS") {
    exitFocusMode(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_FOCUS_STATE") {
    getFocusState().then(sendResponse);
    return true;
  }
  if (msg.type === "EXPORT_MARKDOWN") {
    exportWindowMarkdown(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_HYGIENE") {
    getTabHygiene(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_RECENTLY_CLOSED") {
    getRecentlyClosed().then(tabs => sendResponse({ ok: true, tabs }));
    return true;
  }
  if (msg.type === "RESTORE_RECENTLY_CLOSED") {
    restoreRecentlyClosed(msg.sessionId).then(sendResponse);
    return true;
  }
});