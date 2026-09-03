// background.js - Stax Core Engine

const MANAGED_GROUPS_KEY = "managedGroupIds";
const LAST_AI_CALL_KEY = "lastAiCallTs";
const AI_COOLDOWN_MS = 15000;

// Upgraded rule engine: Instant local organization without needing an API key
const LOCAL_RULES = [
  { 
    name: "Banking & Pay", 
    color: "green", 
    test: (h, u) => /paypal\.com|stripe\.com|chase\.com|bankofamerica\.com|wellsfargo\.com|revolut\.com|wise\.com|venmo\.com/.test(h) || /bank|finance|wallet/.test(u) 
  },
  { 
    name: "Dev & Code", 
    color: "blue", 
    test: (h) => /github\.com|gitlab\.com|stackoverflow\.com|developer\.mozilla\.org|npmjs\.com|localhost|127\.0\.0\.1|codepen\.io/.test(h) 
  },
  { 
    name: "Docs & Reference", 
    color: "cyan", 
    test: (h, u) => /^docs\.|readthedocs\.io|notion\.so|wikipedia\.org|wikihow\.com/.test(h) || /\/docs\//.test(u) 
  },
  { 
    name: "Comms", 
    color: "purple", 
    test: (h) => /mail\.google\.com|outlook\.(live|office)\.com|slack\.com|discord\.com|telegram\.org/.test(h) 
  },
  { 
    name: "Media & Social", 
    color: "pink", 
    test: (h) => /youtube\.com|reddit\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|facebook\.com|twitch\.tv|netflix\.com|spotify\.com/.test(h) 
  },
  { 
    name: "Shopping", 
    color: "orange", 
    test: (h) => /amazon\.|ebay\.|etsy\.com|aliexpress\.com|target\.com|walmart\.com/.test(h) 
  }
];

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

function isValidTab(tab) {
  if (!tab.url || tab.pinned) return false;
  // Ignore browser internal pages that crash chrome.tabs.group
  if (/^(chrome|brave|edge|about|devtools):/.test(tab.url)) return false;
  return true;
}

function localCategoryFor(tab) {
  const h = hostnameOf(tab.url || "");
  const u = tab.url || "";
  for (const rule of LOCAL_RULES) {
    if (rule.test(h, u)) return { name: rule.name, color: rule.color };
  }
  const cleanHost = h.replace(/^www\./, "");
  return { name: cleanHost ? cleanHost.split(".")[0].toUpperCase() : "Other", color: "grey" };
}

// Keep the extension badge updated with open tab count
async function updateBadge() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const count = tabs.length;
  chrome.action.setBadgeText({ text: count ? count.toString() : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
}

async function getManagedGroupIds() {
  const { [MANAGED_GROUPS_KEY]: ids } = await chrome.storage.local.get(MANAGED_GROUPS_KEY);
  return ids || {};
}

async function setManagedGroupIds(map) {
  await chrome.storage.local.set({ [MANAGED_GROUPS_KEY]: map });
}

async function applyGrouping(assignments, windowId) {
  const managed = await getManagedGroupIds();
  const byGroup = new Map();
  for (const a of assignments) {
    if (!byGroup.has(a.group)) byGroup.set(a.group, { color: a.color, tabIds: [] });
    byGroup.get(a.group).tabIds.push(a.tabId);
  }

  for (const [groupName, { color, tabIds }] of byGroup) {
    const existingId = managed[groupName];
    let groupId;
    try {
      if (existingId) {
        await chrome.tabGroups.get(existingId);
        groupId = await chrome.tabs.group({ tabIds, groupId: existingId });
      } else {
        groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
        await chrome.tabGroups.update(groupId, { title: groupName, color });
        managed[groupName] = groupId;
      }
    } catch {
      groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title: groupName, color });
      managed[groupName] = groupId;
    }
  }
  await setManagedGroupIds(managed);
}

let localSortTimer = null;
function scheduleLocalSort(windowId) {
  updateBadge();
  clearTimeout(localSortTimer);
  localSortTimer = setTimeout(() => runLocalSort(windowId), 400);
}

async function runLocalSort(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const assignments = tabs
    .filter(isValidTab)
    .map((t) => {
      const { name, color } = localCategoryFor(t);
      return { tabId: t.id, group: name, color };
    });
  if (assignments.length) await applyGrouping(assignments, windowId);
}

// Power User Feature: Close duplicate tabs instantly
async function removeDuplicates(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const seenUrls = new Set();
  const duplicateTabIds = [];

  for (const tab of tabs) {
    if (tab.url && !tab.pinned) {
      if (seenUrls.has(tab.url)) {
        duplicateTabIds.push(tab.id);
      } else {
        seenUrls.add(tab.url);
      }
    }
  }

  if (duplicateTabIds.length) {
    await chrome.tabs.remove(duplicateTabIds);
  }
  updateBadge();
  return duplicateTabIds.length;
}

// Event Listeners for Tab Life Cycle
chrome.tabs.onCreated.addListener((tab) => scheduleLocalSort(tab.windowId));
chrome.tabs.onRemoved.addListener(() => updateBadge());
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  updateBadge();
  if (info.status === "complete") scheduleLocalSort(tab.windowId);
});

// Keyboard Hotkeys
chrome.commands.onCommand.addListener((command) => {
  if (command === "quick-sort") {
    chrome.windows.getCurrent((win) => {
      if (win.id) runLocalSort(win.id);
    });
  }
});

// Message Routing for Popup UI
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "LOCAL_SORT") {
    runLocalSort(msg.windowId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "REMOVE_DUPLICATES") {
    removeDuplicates(msg.windowId).then((count) => sendResponse({ ok: true, removed: count }));
    return true;
  }
});

// Snooze tabs idle for longer than the trhreshold (default 30 minutes)
async function snoozeInactivTabs(maxIdleMinutes = 30) {
  const tabs = await chrome.tabs.query({active: false, pinned: false, discared: false});
  const cutoff = Date.now() - (naxIdleMinutes * 60 * 1000);

  for (const tab of tabs) {
    if (tab.lastAccessed && tab.lastAccessed < cutoff) {
      // Unloads page contents from Ram while keeping Tab visible
      await chrome.tabs.discard(tab.id);
    }
  }
}

// RUn memory cleanup check every 15 minutes
chrome.alarms.create("snoozeCheck", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "snoozeCheck") snoozeInactiveTabs(30);
});

// Save current window tab groups as a named workspace
async function saveWorkspace(workspaceName) {
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

  const snapshot = groups.map(group => ({
    title: group.title,
    color: group.color,
    urls: tabs.filter(t => t.groupId === group.id).map(t => t.url)
  }));

  const { workspaces = {} } = await chrome.storage.local.get("workspaces");
  workspaces[workspaceName] = snapshot;
  await chrome.storage.local.set({ workspaces });
}