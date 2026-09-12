// actions.js: tab activity tracking, badge, undo, group controls,
// saved sessions, AI search, suspend. No Stacklet logic here.

// slow, costly, and exactly the "relying on AI for something simple"
// problem this is supposed to avoid. Debounced per window so opening a
// batch of tabs at once (restoring a session, opening a link group)
// triggers one sort instead of N overlapping ones.
const autoSortTimers = new Map();
const AUTO_SORT_DEBOUNCE_MS = 900;

async function isAutoSortEnabled() {
  const { autoSortOnNewTab = false } = await chrome.storage.sync.get(["autoSortOnNewTab"]);
  return !!autoSortOnNewTab;
}

function scheduleAutoSort(windowId) {
  if (windowId == null) return;
  clearTimeout(autoSortTimers.get(windowId));
  autoSortTimers.set(windowId, setTimeout(async () => {
    autoSortTimers.delete(windowId);
    if (!(await isAutoSortEnabled())) return;
    try {
      await runLocalSort(windowId);
    } catch (err) {
      console.warn("Stax: auto-sort failed", err);
    }
  }, AUTO_SORT_DEBOUNCE_MS));
}

chrome.tabs.onCreated.addListener((tab) => {
  scheduleAutoSort(tab.windowId);
});

// Also catch the case where a tab's URL only resolves after creation
// (new-tab-page -> typed URL, or a link opened in a blank tab).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    scheduleAutoSort(tab.windowId);
  }
});

// ---- Toolbar badge ----
// Shows the unpinned tab count for whichever window currently has focus.
// Recomputed on the events that can change it rather than stored anywhere,
// since a service worker can be killed and restarted between events and
// there's nothing worth persisting here, it's cheap to recalculate.
async function updateBadgeForWindow(windowId) {
  if (windowId == null || windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const tabs = await chrome.tabs.query({ windowId, pinned: false });
    await chrome.action.setBadgeText({ text: tabs.length > 0 ? String(tabs.length) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#7c5cff" });
  } catch (err) {
    // Window can close between the event firing and this running, not worth logging.
  }
}

async function refreshBadgeForFocusedWindow() {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    await updateBadgeForWindow(win.id);
  } catch (err) {
    await chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }
}

chrome.tabs.onCreated.addListener(() => refreshBadgeForFocusedWindow());
chrome.tabs.onRemoved.addListener(() => refreshBadgeForFocusedWindow());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") refreshBadgeForFocusedWindow();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) updateBadgeForWindow(windowId);
});
chrome.runtime.onInstalled.addListener(() => refreshBadgeForFocusedWindow());
chrome.runtime.onStartup.addListener(() => refreshBadgeForFocusedWindow());

// ---- Tab activity tracking (for Suspend Inactive Tabs) ----
// Kept in chrome.storage.session rather than a plain in-memory Map, a
// service worker gets killed and restarted constantly in MV3, and a plain
// Map would silently reset every time that happens. storage.session
// survives worker restarts and only clears when the browser itself closes,
// which is exactly the lifetime this needs.
async function touchTabActive(tabId) {
  if (tabId == null) return;
  try {
    const { tabLastActive = {} } = await chrome.storage.session.get(["tabLastActive"]);
    tabLastActive[tabId] = Date.now();
    await chrome.storage.session.set({ tabLastActive });
  } catch (err) {
    console.warn("Stax: touchTabActive failed", err);
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => touchTabActive(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) touchTabActive(tabId);
});

// Give every tab that already exists a baseline timestamp. Without this,
// tabs open from before install (or from before the last worker restart)
// have no activity record at all, which makes them invisible to the archive
// sweep, since that deliberately skips tabs it knows nothing about.
async function seedTabActivity() {
  try {
    const tabs = await chrome.tabs.query({});
    const { tabLastActive = {} } = await chrome.storage.session.get(["tabLastActive"]);
    const now = Date.now();
    let added = 0;
    for (const t of tabs) {
      if (tabLastActive[t.id] == null) { tabLastActive[t.id] = now; added++; }
    }
    if (added) await chrome.storage.session.set({ tabLastActive });
  } catch (err) {
    console.warn("Stax: seedTabActivity failed", err);
  }
}

chrome.runtime.onInstalled.addListener(() => seedTabActivity());
chrome.runtime.onStartup.addListener(() => seedTabActivity());

// Drop records for closed tabs so the map doesn't grow across a long session.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const { tabLastActive = {} } = await chrome.storage.session.get(["tabLastActive"]);
    if (tabLastActive[tabId] != null) {
      delete tabLastActive[tabId];
      await chrome.storage.session.set({ tabLastActive });
    }
  } catch { /* not worth surfacing */ }
});

const SUSPEND_INACTIVE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes

// Discards (not closes) unpinned, inactive, non-audible tabs that haven't
// been focused in a while, frees the RAM/CPU they were using without
// losing them; Chrome reloads the page automatically if you click back in.
async function suspendInactiveTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId, pinned: false, active: false, audible: false, discarded: false });
  let tabLastActive = {};
  try {
    ({ tabLastActive = {} } = await chrome.storage.session.get(["tabLastActive"]));
  } catch (err) {
    console.warn("Stax: could not read tab activity, treating all as inactive", err);
  }
  const now = Date.now();
  let suspended = 0;
  for (const tab of tabs) {
    const lastActive = tabLastActive[tab.id];
    // Never tracked (tab predates this feature, or we lost the record to a
    // service-worker restart) counts as inactive too rather than being skipped.
    const inactiveFor = lastActive ? now - lastActive : Infinity;
    if (inactiveFor >= SUSPEND_INACTIVE_THRESHOLD_MS) {
      try {
        await chrome.tabs.discard(tab.id);
        suspended++;
      } catch (err) {
        console.warn("Stax: failed to discard tab", tab.id, err);
      }
    }
  }
  return suspended;
}

// ---- Group-level actions (used by the side panel's per-group controls) ----

async function toggleGroupCollapse(groupId) {
  try {
    const group = await chrome.tabGroups.get(groupId);
    await chrome.tabGroups.update(groupId, { collapsed: !group.collapsed });
    return true;
  } catch (err) {
    console.warn("Stax: toggleGroupCollapse failed", err);
    return false;
  }
}

async function renameGroup(groupId, newTitle) {
  const title = (newTitle || "").trim();
  if (!title) return false;
  try {
    await chrome.tabGroups.update(groupId, { title });
    return true;
  } catch (err) {
    console.warn("Stax: renameGroup failed", err);
    return false;
  }
}

// Recreates the group's tabs in a brand-new window. Note: this reopens each
// URL rather than truly relocating the tab, so unsaved form input or scroll
// position won't carry over, a real limitation of the tabs API, which has
// no "move an existing tab group between windows" primitive.
async function moveGroupToNewWindow(groupId) {
  try {
    const group = await chrome.tabGroups.get(groupId);
    const tabs = await chrome.tabs.query({ groupId });
    const urls = tabs.map(t => t.url).filter(Boolean);
    if (!urls.length) return false;

    const newWin = await chrome.windows.create({ url: urls[0] });
    const createdIds = [];
    if (newWin.tabs?.[0]?.id != null) createdIds.push(newWin.tabs[0].id);
    for (let i = 1; i < urls.length; i++) {
      const created = await chrome.tabs.create({ windowId: newWin.id, url: urls[i], active: false });
      createdIds.push(created.id);
    }
    if (createdIds.length) {
      const newGroupId = await chrome.tabs.group({ tabIds: createdIds, createProperties: { windowId: newWin.id } });
      await chrome.tabGroups.update(newGroupId, { title: group.title, color: group.color });
    }
    await chrome.tabs.remove(tabs.map(t => t.id));
    return true;
  } catch (err) {
    console.warn("Stax: moveGroupToNewWindow failed", err);
    return false;
  }
}

async function jumpToTab(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    return true;
  } catch (err) {
    console.warn("Stax: jumpToTab failed", err);
    return false;
  }
}

// ---- Undo ----
// Best-effort, one-step undo for the two actions that can otherwise surprise
// you: a sort that grouped something wrong, and a dedupe that closed a tab
// you actually wanted. Stored in storage.session (survives worker restarts,
// clears on browser close) with a short expiry so "undo" never reaches back
// further than the person would expect.
const LAST_ACTION_KEY = "stax_last_action";
const UNDO_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

async function recordLastAction(action) {
  try {
    await chrome.storage.session.set({ [LAST_ACTION_KEY]: { ...action, timestamp: Date.now() } });
  } catch (err) {
    console.warn("Stax: recordLastAction failed", err);
  }
}

async function getUndoableAction() {
  try {
    const { [LAST_ACTION_KEY]: action } = await chrome.storage.session.get([LAST_ACTION_KEY]);
    if (!action) return null;
    if (Date.now() - action.timestamp > UNDO_WINDOW_MS) return null;
    return action;
  } catch (err) {
    return null;
  }
}

async function clearLastAction() {
  try {
    await chrome.storage.session.remove([LAST_ACTION_KEY]);
  } catch (err) { /* not worth surfacing */ }
}

async function undoLastAction() {
  const action = await getUndoableAction();
  if (!action) return { ok: false, error: "nothing-to-undo" };
  await clearLastAction();

  if (action.type === "sort") {
    for (const groupId of action.groupIds) {
      try {
        const tabs = await chrome.tabs.query({ groupId });
        if (tabs.length) await chrome.tabs.ungroup(tabs.map(t => t.id));
      } catch (err) {
        // Group may already be gone (manually ungrouped since), nothing to undo there.
      }
    }
    return { ok: true, type: "sort" };
  }

  if (action.type === "dedupe") {
    for (const t of action.removedTabs) {
      try {
        await chrome.tabs.create({ windowId: action.windowId, url: t.url, active: false });
      } catch (err) {
        console.warn("Stax: failed to reopen tab during undo", err);
      }
    }
    return { ok: true, type: "dedupe" };
  }

  return { ok: false, error: "unknown-action" };
}

// ---- Saved sessions ----
// A session is a named snapshot of a window's tabs (URL, title, and which
// group each tab was in) so it can be closed now and reopened later, even
// after a full browser restart. Stored in storage.local since a big
// tab list can exceed storage.sync's per-item quota.
const SESSIONS_KEY = "stax_sessions";

async function saveSession(windowId, name) {
  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  const groups = await chrome.tabGroups.query({ windowId });
  const groupById = new Map(groups.map(g => [g.id, g]));

  const tabRecords = tabs
    .filter(t => t.url && !/^(chrome|chrome-extension|brave|edge|edge-extension|moz-extension|about|file):/.test(t.url))
    .map(t => {
      const g = t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? groupById.get(t.groupId) : null;
      return { url: t.url, title: t.title || "", groupTitle: g?.title || null, groupColor: g?.color || null };
    });
  if (!tabRecords.length) return { ok: false, error: "no-tabs" };

  try {
    const { [SESSIONS_KEY]: sessions = [] } = await chrome.storage.local.get([SESSIONS_KEY]);
    const session = { id: `${Date.now()}`, name: (name || "").trim() || `Session ${sessions.length + 1}`, savedAt: Date.now(), tabs: tabRecords };
    sessions.push(session);
    await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
    return { ok: true, session: { id: session.id, name: session.name, savedAt: session.savedAt, tabCount: tabRecords.length } };
  } catch (err) {
    console.warn("Stax: saveSession failed", err);
    return { ok: false, error: "storage-failed" };
  }
}

async function listSessions() {
  const { [SESSIONS_KEY]: sessions = [] } = await chrome.storage.local.get([SESSIONS_KEY]);
  // Newest first; don't ship the full tab list to the popup just to render a row.
  return sessions
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt, tabCount: s.tabs.length }));
}

async function deleteSession(id) {
  const { [SESSIONS_KEY]: sessions = [] } = await chrome.storage.local.get([SESSIONS_KEY]);
  await chrome.storage.local.set({ [SESSIONS_KEY]: sessions.filter(s => s.id !== id) });
  return true;
}

async function restoreSession(id) {
  const { [SESSIONS_KEY]: sessions = [] } = await chrome.storage.local.get([SESSIONS_KEY]);
  const session = sessions.find(s => s.id === id);
  if (!session || !session.tabs.length) return { ok: false, error: "not-found" };

  const [first, ...rest] = session.tabs;
  const newWin = await chrome.windows.create({ url: first.url });
  const firstTabId = newWin.tabs?.[0]?.id;

  // Groups have to be created after every tab exists, since chrome.tabs.group
  // needs real tab ids, collect them per groupTitle as tabs get created.
  const byGroup = new Map();
  if (first.groupTitle) byGroup.set(first.groupTitle, { color: first.groupColor || "grey", tabIds: firstTabId != null ? [firstTabId] : [] });

  for (const t of rest) {
    const created = await chrome.tabs.create({ windowId: newWin.id, url: t.url, active: false });
    if (t.groupTitle) {
      if (!byGroup.has(t.groupTitle)) byGroup.set(t.groupTitle, { color: t.groupColor || "grey", tabIds: [] });
      byGroup.get(t.groupTitle).tabIds.push(created.id);
    }
  }

  for (const [title, { color, tabIds }] of byGroup) {
    if (tabIds.length) await safeGroup(tabIds, newWin.id, title, color);
  }

  return { ok: true };
}

// ---- AI tab search ----
// Same provider/key plumbing as AI grouping, but the prompt asks for a
// single best-match tab id instead of a set of groups, for "find the tab
// where I was booking flights" style natural-language lookups.
function buildSearchPrompt(tabSummaries, query) {
  return [
    "You are helping find one specific browser tab matching a natural-language description.",
    "Return ONLY raw JSON (no markdown fences, no prose) matching this shape:",
    '{"tabId": 123}',
    'If nothing matches reasonably well, return {"tabId": null}.',
    `User is looking for: "${query}"`,
    "Tabs:",
    JSON.stringify(tabSummaries)
  ].join("\n");
}

function parseAiSearchResult(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object") throw new Error("Malformed AI response");
  return parsed.tabId ?? null;
}

async function callAnthropicSearch(apiKey, tabSummaries, query) {
  return fetchWithRetry(async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 256, messages: [{ role: "user", content: buildSearchPrompt(tabSummaries, query) }] })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = (data.content || []).map(b => b.text || "").join("");
    return parseAiSearchResult(text);
  });
}

async function callGeminiSearch(apiKey, model, tabSummaries, query) {
  return fetchWithRetry(async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: buildSearchPrompt(tabSummaries, query) }] }] })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    return parseAiSearchResult(text);
  });
}

async function aiSearchTabs(windowId, query) {
  const { provider = "anthropic", anthropicApiKey, geminiApiKey, geminiModel = "gemini-flash-latest" } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey", "geminiModel"]);
  const apiKey = provider === "gemini" ? geminiApiKey : anthropicApiKey;
  if (!apiKey) return { ok: false, error: "no-key" };

  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  if (!tabs.length) return { ok: false, error: "no-tabs" };

  const tabSummaries = tabs.map(t => {
    let host = "";
    try { host = new URL(t.url).hostname; } catch { /* ignore malformed URL */ }
    return { id: t.id, title: t.title || "", host };
  });

  try {
    const tabId = provider === "gemini"
      ? await callGeminiSearch(apiKey, geminiModel, tabSummaries, query)
      : await callAnthropicSearch(apiKey, tabSummaries, query);
    return { ok: true, tabId };
  } catch (err) {
    console.warn("Stax: AI search failed", err);
    return { ok: false, error: err.message || "AI search failed" };
  }
}


// ---- Recently closed ----
// Chrome's sessions API gives us a richer recently-closed list than anything
// we could maintain ourselves -- it survives service-worker restarts and
// captures tabs closed by the user directly (not just through Stax).
// We cap at 25 entries and return only the fields the UI needs.
async function getRecentlyClosed(maxResults = 25) {
  try {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults });
    return sessions
      .filter(s => s.tab)
      .map(s => ({
        sessionId: s.tab.sessionId,
        title: s.tab.title || "",
        url: s.tab.url || "",
        favIconUrl: s.tab.favIconUrl || "",
        lastModified: s.lastModified
      }));
  } catch (err) {
    console.warn("Stax: getRecentlyClosed failed", err);
    return [];
  }
}

async function restoreRecentlyClosed(sessionId) {
  try {
    await chrome.sessions.restore(sessionId);
    return { ok: true };
  } catch (err) {
    console.warn("Stax: restoreRecentlyClosed failed", err);
    return { ok: false, error: err.message };
  }
}

// ---- Merge / split windows ----

async function mergeAllWindows() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  if (windows.length < 2) return { ok: true, merged: 0 };

  // Sort by tab count descending so the biggest window is the target,
  // which keeps its tab order most intact.
  windows.sort((a, b) => b.tabs.length - a.tabs.length);
  const [target, ...sources] = windows;

  let merged = 0;
  for (const win of sources) {
    for (const tab of win.tabs) {
      try {
        await chrome.tabs.move(tab.id, { windowId: target.id, index: -1 });
        merged++;
      } catch (err) {
        console.warn("Stax: merge failed for tab", tab.id, err);
      }
    }
  }
  return { ok: true, merged, targetWindowId: target.id };
}

// Moves each tab group and its tabs into a new window. Ungrouped tabs stay
// in the original window.
async function splitIntoWindows(windowId) {
  const groups = await chrome.tabGroups.query({ windowId });
  if (!groups.length) return { ok: false, error: "no-groups" };

  let created = 0;
  for (const g of groups) {
    const tabs = await chrome.tabs.query({ groupId: g.id });
    if (!tabs.length) continue;
    try {
      const newWin = await chrome.windows.create({ tabId: tabs[0].id });
      const newTabIds = [newWin.tabs[0].id];
      for (let i = 1; i < tabs.length; i++) {
        await chrome.tabs.move(tabs[i].id, { windowId: newWin.id, index: -1 });
        newTabIds.push(tabs[i].id);
      }
      const newGroupId = await chrome.tabs.group({ tabIds: newTabIds, createProperties: { windowId: newWin.id } });
      await chrome.tabGroups.update(newGroupId, { title: g.title, color: g.color });
      created++;
    } catch (err) {
      console.warn("Stax: split failed for group", g.id, err);
    }
  }
  return { ok: true, created };
}

// ---- Group-level extras ----

// Closes every tab in a group. Snapshots them first so Undo can restore,
// since this is the most destructive single click in the UI.
async function closeGroupTabs(groupId) {
  try {
    const tabs = await chrome.tabs.query({ groupId });
    if (!tabs.length) return { ok: false, error: "empty-group" };
    const records = tabs.map(t => ({ url: t.url, title: t.title || "" }));
    const windowId = tabs[0].windowId;
    await chrome.tabs.remove(tabs.map(t => t.id));
    await recordLastAction({ type: "dedupe", windowId, removedTabs: records });
    return { ok: true, closed: records.length };
  } catch (err) {
    console.warn("Stax: closeGroupTabs failed", err);
    return { ok: false, error: err.message };
  }
}

// Moves a group left or right among its siblings. tabGroups.move takes an
// absolute tab index, so we work out the destination from the neighbouring
// group's span rather than trying to offset by a fixed amount.
async function moveGroupBy(groupId, direction) {
  try {
    const group = await chrome.tabGroups.get(groupId);
    const groups = await chrome.tabGroups.query({ windowId: group.windowId });
    const allTabs = await chrome.tabs.query({ windowId: group.windowId });

    // Order groups by the index of their first tab.
    const withIndex = groups.map(g => {
      const tabs = allTabs.filter(t => t.groupId === g.id);
      return { id: g.id, first: Math.min(...tabs.map(t => t.index)), size: tabs.length };
    }).sort((a, b) => a.first - b.first);

    const pos = withIndex.findIndex(g => g.id === groupId);
    const swapWith = withIndex[pos + direction];
    if (pos === -1 || !swapWith) return { ok: false, error: "at-edge" };

    // Moving right: land after the neighbour's last tab. Moving left: land
    // at the neighbour's first tab.
    const target = direction > 0
      ? swapWith.first + swapWith.size - withIndex[pos].size
      : swapWith.first;

    await chrome.tabGroups.move(groupId, { index: Math.max(0, target) });
    return { ok: true };
  } catch (err) {
    console.warn("Stax: moveGroupBy failed", err);
    return { ok: false, error: err.message };
  }
}

// ---- Tab tree ----
// Chrome records which tab opened which via openerTabId. Nothing surfaces
// that, so a research session looks like a flat wall of tabs when it was
// actually a branching trail. This reconstructs the forest.
async function getTabTree(windowId) {
  try {
    const tabs = await chrome.tabs.query({ windowId });
    const byId = new Map(tabs.map(t => [t.id, t]));

    const node = (t) => {
      let host = "";
      try { host = new URL(t.url).hostname.replace(/^www\./, ""); } catch {}
      return { id: t.id, title: (t.title || host || "Untitled").slice(0, 90), host, children: [] };
    };

    const nodes = new Map(tabs.map(t => [t.id, node(t)]));
    const roots = [];

    for (const t of tabs) {
      // A tab counts as a child only if its opener is still open in this
      // window. Orphans (opener closed) become roots rather than vanishing.
      const parent = t.openerTabId != null && byId.has(t.openerTabId)
        ? nodes.get(t.openerTabId)
        : null;
      if (parent) parent.children.push(nodes.get(t.id));
      else roots.push(nodes.get(t.id));
    }

    // Depth is capped when rendering, but compute the real one so the UI can
    // show "+3 deeper" rather than silently truncating.
    const depthOf = (n) => n.children.length ? 1 + Math.max(...n.children.map(depthOf)) : 1;
    const maxDepth = roots.length ? Math.max(...roots.map(depthOf)) : 0;
    const branching = roots.filter(r => r.children.length > 0).length;

    return { ok: true, roots, maxDepth, branching, total: tabs.length };
  } catch (err) {
    console.warn("Stax: getTabTree failed", err);
    return { ok: false, error: err.message };
  }
}