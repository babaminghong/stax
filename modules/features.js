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
  if (msg.type === "GET_ACCESSORIES") {
    getAccessories().then(sendResponse);
    return true;
  }
  if (msg.type === "EQUIP_ACCESSORY") {
    equipAccessory(msg.id).then(sendResponse);
    return true;
  }
  // Bump usage counters when core actions complete so accessories unlock
  // at the right time without the popup having to know about them.
  if (msg.type === "BUMP_USAGE") {
    bumpUsage(msg.key, msg.by || 1).then(r => sendResponse({ ok: true, newItems: r }));
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
  if (msg.type === "MERGE_WINDOWS") {
    mergeAllWindows().then(sendResponse);
    return true;
  }
  if (msg.type === "SPLIT_WINDOWS") {
    splitIntoWindows(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "CLOSE_GROUP_TABS") {
    closeGroupTabs(msg.groupId).then(sendResponse);
    return true;
  }
  if (msg.type === "MOVE_GROUP_BY") {
    moveGroupBy(msg.groupId, msg.direction).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_TAB_TREE") {
    getTabTree(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_WEEKLY_DIGEST") {
    getWeeklyDigest().then(sendResponse);
    return true;
  }
  if (msg.type === "GET_SUGGESTED_RULES") {
    getSuggestedRules().then(sendResponse);
    return true;
  }
  if (msg.type === "ACCEPT_SUGGESTED_RULE") {
    acceptSuggestedRule(msg.domains, msg.name, msg.color).then(sendResponse);
    return true;
  }
  if (msg.type === "DISMISS_SUGGESTED_RULE") {
    dismissSuggestedRule(msg.domains).then(sendResponse);
    return true;
  }
});

// ---- Points, levels, and accessories ----
// Every meaningful interaction earns points, and accessories unlock at point
// thresholds. This replaced a set of separate counters (sorts, dedupes,
// sessions) each gating its own item: that meant someone who used one feature
// heavily never unlocked anything, while the point pool rewards any use.
// Points are awarded per action type, weighted by effort rather than
// frequency, so spamming the cheapest button isn't the fastest route.
const ACC_KEY = "stax_accessories";
const USAGE_KEY = "stax_usage";

const POINT_VALUES = {
  sort: 10,          // the core action
  ai_sort: 15,       // costs the user an API call, worth more
  dedupe: 8,
  suspend: 6,
  focus: 5,
  session_save: 12,
  session_restore: 6,
  archive: 8,
  merge: 6,
  split: 6,
  export: 4,
  chat: 5,           // talking to Stacklet
  action_run: 10,    // approving one of his suggestions
  poke: 1,           // capped in practice by the cooldown below
  tutorial: 25,      // one-off, rewards finishing onboarding
};

// Levels are just labelled point bands. Kept generous early so the first
// unlock lands in the first session, then widening so later ones feel earned.
const LEVEL_THRESHOLDS = [0, 25, 75, 150, 275, 450, 700, 1000, 1400];

function levelFor(points) {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  }
  return lvl;
}

function pointsForNextLevel(points) {
  const next = LEVEL_THRESHOLDS.find(t => t > points);
  return next == null ? null : next;
}

const ACCESSORY_DEFS = [
  { id: "hat",        label: "Tiny Hat",   cost: 25 },
  { id: "glasses",    label: "Glasses",    cost: 75 },
  { id: "scarf",      label: "Scarf",      cost: 150 },
  { id: "headphones", label: "Headphones", cost: 275 },
  { id: "backpack",   label: "Backpack",   cost: 450 },
  { id: "crown",      label: "Crown",      cost: 700 },
  { id: "stars",      label: "Star Aura",  cost: 1000 },
  { id: "cape",       label: "Cape",       cost: 1400 },
];

async function getUsage() {
  const { [USAGE_KEY]: u } = await chrome.storage.sync.get([USAGE_KEY]);
  return u || { points: 0, actions: 0, firstSeen: Date.now(), lastPoke: 0 };
}

// Awards points and returns anything newly unlocked, so the UI can show a
// toast in the same interaction rather than on next open.
async function awardPoints(kind, multiplier = 1) {
  try {
    const u = await getUsage();
    const base = POINT_VALUES[kind] ?? 0;
    if (!base) return { ok: true, gained: 0, newItems: [], usage: u };

    // Poking is free entertainment, so it only pays out once a minute.
    // Without this, holding down a click would farm every accessory.
    if (kind === "poke") {
      if (Date.now() - (u.lastPoke || 0) < 60000) {
        return { ok: true, gained: 0, newItems: [], usage: u };
      }
      u.lastPoke = Date.now();
    }

    const before = u.points || 0;
    const gained = Math.round(base * multiplier);
    u.points = before + gained;
    u.actions = (u.actions || 0) + 1;

    const newItems = ACCESSORY_DEFS.filter(d => d.cost > before && d.cost <= u.points);
    if (newItems.length) {
      const { [ACC_KEY]: owned = [] } = await chrome.storage.sync.get([ACC_KEY]);
      const ownedIds = new Set(owned.map(a => a.id));
      const toAdd = newItems.filter(d => !ownedIds.has(d.id));
      if (toAdd.length) {
        await chrome.storage.sync.set({
          [ACC_KEY]: [...owned, ...toAdd.map(d => ({ id: d.id, unlockedAt: Date.now() }))]
        });
      }
    }

    await chrome.storage.sync.set({ [USAGE_KEY]: u });
    return {
      ok: true,
      gained,
      points: u.points,
      level: levelFor(u.points),
      levelUp: levelFor(before) !== levelFor(u.points),
      newItems,
    };
  } catch (err) {
    console.warn("Stax: awardPoints failed", err);
    return { ok: false, gained: 0, newItems: [] };
  }
}

async function getAccessories() {
  const u = await getUsage();
  const { [ACC_KEY]: owned = [] } = await chrome.storage.sync.get([ACC_KEY]);
  const { stackletAccessory = null } = await chrome.storage.sync.get(["stackletAccessory"]);
  const ownedIds = new Set(owned.map(a => a.id));
  const points = u.points || 0;
  const nextAt = pointsForNextLevel(points);

  return {
    ok: true,
    points,
    level: levelFor(points),
    nextLevelAt: nextAt,
    progressToNext: nextAt ? Math.round(((points - (LEVEL_THRESHOLDS[levelFor(points) - 1] || 0)) / (nextAt - (LEVEL_THRESHOLDS[levelFor(points) - 1] || 0))) * 100) : 100,
    equipped: stackletAccessory,
    all: ACCESSORY_DEFS.map(d => ({
      id: d.id,
      label: d.label,
      cost: d.cost,
      unlocked: ownedIds.has(d.id) || points >= d.cost,
      remaining: Math.max(0, d.cost - points),
    })),
  };
}

async function equipAccessory(id) {
  if (id) {
    const acc = await getAccessories();
    const item = acc.all.find(a => a.id === id);
    if (!item?.unlocked) return { ok: false, error: "not-unlocked" };
  }
  await chrome.storage.sync.set({ stackletAccessory: id || null });
  return { ok: true };
}


// ---- Weekly digest ----
// Rolls the stats already being collected into a readable summary. Generated
// on demand rather than stored, so there's no second source of truth to keep
// in sync with the raw per-day data.
async function getWeeklyDigest() {
  try {
    const stats = await getTimeStats(7);
    const usage = await getUsage();
    const { [ARCHIVE_KEY]: archive = [] } = await chrome.storage.local.get([ARCHIVE_KEY]);
    const { [SESSIONS_KEY]: sessions = [] } = await chrome.storage.local.get([SESSIONS_KEY]);

    const weekAgo = Date.now() - 7 * 86400000;
    const archivedThisWeek = archive.filter(a => a.archivedAt >= weekAgo).length;
    const sessionsThisWeek = sessions.filter(s => s.savedAt >= weekAgo).length;

    const busiest = (stats.perDay || []).reduce(
      (best, d) => (d.total > (best?.total ?? -1) ? d : best), null);
    const topCategory = (stats.totals || [])[0] || null;

    // Compare the back half of the week against the front half. Anything
    // shorter than a full week of data makes the trend meaningless, so it's
    // reported as null rather than a misleading number.
    const days = stats.perDay || [];
    let trend = null;
    if (days.length >= 6 && stats.grandTotal > 0) {
      const half = Math.floor(days.length / 2);
      const early = days.slice(0, half).reduce((a, d) => a + d.total, 0);
      const late = days.slice(half).reduce((a, d) => a + d.total, 0);
      if (early > 0) trend = Math.round(((late - early) / early) * 100);
    }

    return {
      ok: true,
      totalMs: stats.grandTotal || 0,
      perDay: days,
      categories: (stats.totals || []).slice(0, 5),
      busiestDay: busiest?.day || null,
      busiestMs: busiest?.total || 0,
      topCategory: topCategory?.category || null,
      archivedThisWeek,
      sessionsThisWeek,
      points: usage.points || 0,
      level: levelFor(usage.points || 0),
      trend,
    };
  } catch (err) {
    console.warn("Stax: getWeeklyDigest failed", err);
    return { ok: false, error: err.message };
  }
}

// ---- Rules learned from behaviour ----
// When the user manually drops two domains into the same group repeatedly,
// that's a rule they're enacting by hand. This watches for the pattern and
// offers to make it permanent, rather than requiring them to discover the
// custom-rules editor.
const COOCCUR_KEY = "stax_cooccurrence";
const SUGGEST_THRESHOLD = 3;

async function recordManualGrouping(groupId) {
  try {
    const tabs = await chrome.tabs.query({ groupId });
    const group = await chrome.tabGroups.get(groupId);
    const hosts = [...new Set(tabs.map(t => {
      try { return new URL(t.url).hostname.replace(/^www\./, ""); } catch { return null; }
    }).filter(Boolean))];
    if (hosts.length < 2) return;

    const { [COOCCUR_KEY]: data = {} } = await chrome.storage.local.get([COOCCUR_KEY]);

    // Key on the sorted host pair so a,b and b,a are the same observation.
    for (let i = 0; i < hosts.length; i++) {
      for (let j = i + 1; j < hosts.length; j++) {
        const key = [hosts[i], hosts[j]].sort().join("|");
        const entry = data[key] || { count: 0, names: {} };
        entry.count++;
        if (group.title) entry.names[group.title] = (entry.names[group.title] || 0) + 1;
        data[key] = entry;
      }
    }
    await chrome.storage.local.set({ [COOCCUR_KEY]: data });
  } catch (err) {
    console.warn("Stax: recordManualGrouping failed", err);
  }
}

// Returns pairs seen together often enough to be worth a rule, excluding
// anything an existing rule already covers.
async function getSuggestedRules() {
  try {
    const { [COOCCUR_KEY]: data = {} } = await chrome.storage.local.get([COOCCUR_KEY]);
    const { customRules = [] } = await chrome.storage.sync.get(["customRules"]);
    const covered = new Set(customRules.flatMap(r => r.domains || []));

    const suggestions = Object.entries(data)
      .filter(([, v]) => v.count >= SUGGEST_THRESHOLD)
      .map(([key, v]) => {
        const domains = key.split("|");
        // Use the group name they picked most often for this pair.
        const name = Object.entries(v.names).sort((a, b) => b[1] - a[1])[0]?.[0] || domains[0];
        return { domains, name, count: v.count };
      })
      .filter(s => !s.domains.every(d => covered.has(d)))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { ok: true, suggestions };
  } catch (err) {
    return { ok: false, suggestions: [] };
  }
}

async function acceptSuggestedRule(domains, name, color = "cyan") {
  try {
    const { customRules = [] } = await chrome.storage.sync.get(["customRules"]);
    customRules.push({ name, domains, color });
    await chrome.storage.sync.set({ customRules });
    // Forget the observation so it can't be suggested twice.
    const { [COOCCUR_KEY]: data = {} } = await chrome.storage.local.get([COOCCUR_KEY]);
    delete data[[...domains].sort().join("|")];
    await chrome.storage.local.set({ [COOCCUR_KEY]: data });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function dismissSuggestedRule(domains) {
  try {
    const { [COOCCUR_KEY]: data = {} } = await chrome.storage.local.get([COOCCUR_KEY]);
    delete data[[...domains].sort().join("|")];
    await chrome.storage.local.set({ [COOCCUR_KEY]: data });
    return { ok: true };
  } catch (err) {
    return { ok: false };
  }
}

// A group the user created or renamed by hand is the signal we learn from.
// Stax-created groups are excluded: learning from our own output would
// reinforce whatever the classifier already does.
chrome.tabGroups.onUpdated.addListener(async (group) => {
  try {
    const { stax_recent_auto = [] } = await chrome.storage.session.get(["stax_recent_auto"]);
    if (stax_recent_auto.includes(group.id)) return;
    if (group.title) recordManualGrouping(group.id);
  } catch { /* best effort */ }
});

// ---- Message routing ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "UNDO_LAST_ACTION") {
    undoLastAction().then(sendResponse);
    return true;
  }
  if (msg.type === "GET_UNDO_STATE") {
    getUndoableAction().then(action => sendResponse({ available: !!action, type: action?.type || null }));
    return true;
  }
  if (msg.type === "ARCHIVE_TABS") {
    archiveTabs(msg.tabIds).then(sendResponse);
    return true;
  }
  if (msg.type === "ARCHIVE_STALE") {
    archiveStaleTabs(msg.windowId, msg.days).then(sendResponse);
    return true;
  }
  if (msg.type === "LIST_ARCHIVE") {
    listArchive().then(sendResponse);
    return true;
  }
  if (msg.type === "RESTORE_ARCHIVED") {
    restoreArchived(msg.id, msg.keep).then(sendResponse);
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
  if (msg.type === "GET_ACCESSORIES") {
    getAccessories().then(sendResponse);
    return true;
  }
  if (msg.type === "EQUIP_ACCESSORY") {
    equipAccessory(msg.id).then(sendResponse);
    return true;
  }
  if (msg.type === "AWARD_POINTS") {
    awardPoints(msg.kind, msg.multiplier).then(sendResponse);
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
  if (msg.type === "MERGE_WINDOWS") {
    mergeAllWindows().then(sendResponse);
    return true;
  }
  if (msg.type === "SPLIT_WINDOWS") {
    splitIntoWindows(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "CLOSE_GROUP_TABS") {
    closeGroupTabs(msg.groupId).then(sendResponse);
    return true;
  }
  if (msg.type === "MOVE_GROUP_BY") {
    moveGroupBy(msg.groupId, msg.direction).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_TAB_TREE") {
    getTabTree(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_WEEKLY_DIGEST") {
    getWeeklyDigest().then(sendResponse);
    return true;
  }
  if (msg.type === "GET_SUGGESTED_RULES") {
    getSuggestedRules().then(sendResponse);
    return true;
  }
  if (msg.type === "ACCEPT_SUGGESTED_RULE") {
    acceptSuggestedRule(msg.domains, msg.name, msg.color).then(sendResponse);
    return true;
  }
  if (msg.type === "DISMISS_SUGGESTED_RULE") {
    dismissSuggestedRule(msg.domains).then(sendResponse);
    return true;
  }
});