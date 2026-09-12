// sort.js: local sort engine, auto-sort scheduler, safeGroup helper.
// Depends on classifier.js being loaded first.


// ---- Quick Actions ----

// Runs the local rule engine and returns both how many groups it made AND
// which tabs it couldn't confidently place, the leftover list is what lets
// hybrid sort hand off to AI instead of just leaving them scattered.
async function runLocalSortCore(windowId) {
  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  const rules = await getAllRules();
  const groupsMap = new Map();
  const groupedTabIds = new Set();

  for (const tab of tabs) {
    const cat = await getCategoryForTab(tab.url, rules, tab.title);
    if (cat) {
      if (!groupsMap.has(cat.name)) {
        groupsMap.set(cat.name, { color: cat.color, tabIds: [], titles: [], isFallback: !!cat.isFallback });
      }
      groupsMap.get(cat.name).tabIds.push(tab.id);
      groupsMap.get(cat.name).titles.push(tab.title || "");
    }
  }

  let groupsCreated = 0;
  const createdGroupIds = [];
  for (const [name, { color, tabIds, titles, isFallback }] of groupsMap) {
    if (tabIds.length === 0) continue;
    if (isFallback && tabIds.length < MIN_TABS_FOR_FALLBACK_GROUP) continue; // no single-tab noise groups

    // Fallback groups are named after a hostname, which is the least useful
    // label available. If the titles in the cluster share a topic, use that
    // instead: "React Router" beats "reactrouter.com". Only fallback groups
    // get renamed, since a real category name is already correct.
    let label = name;
    if (isFallback) {
      const smart = commonTitleLabel(titles);
      if (smart) label = smart;
    }

    const groupId = await safeGroup(tabIds, windowId, label, color);
    if (groupId != null) {
      groupsCreated++;
      createdGroupIds.push(groupId);
      tabIds.forEach(id => groupedTabIds.add(id));
    }
  }

  const leftoverTabs = tabs.filter(t => !groupedTabIds.has(t.id) && !/^(chrome|brave|edge|about):/.test(t.url || ""));
  return { groupsCreated, leftoverTabs, createdGroupIds };
}

async function runLocalSort(windowId) {
  const { groupsCreated, createdGroupIds } = await runLocalSortCore(windowId);
  if (createdGroupIds.length) await recordLastAction({ type: "sort", windowId, groupIds: createdGroupIds });
  return { groupsCreated };
}

// Local rules first, then AI covers whatever's left over, the two engines
// used to be totally disconnected (AI only ever re-sorted everything from
// scratch on a separate button), so tabs the rule engine couldn't place
// just sat there even with a key configured. This is the fix for that.
async function runHybridSort(windowId) {
  const { groupsCreated: localGroups, leftoverTabs, createdGroupIds: localGroupIds } = await runLocalSortCore(windowId);

  const hasKey = await hasApiKeyConfigured();
  let result;
  let allGroupIds = localGroupIds;
  if (!hasKey || leftoverTabs.length < 2) {
    result = { ok: true, groupsCreated: localGroups, aiUsed: false };
  } else {
    const aiResult = await runAiSortOnTabs(windowId, leftoverTabs);
    if (!aiResult.ok) {
      // AI leg failing shouldn't erase the local-sort win, surface it as a
      // partial success rather than an error.
      result = { ok: true, groupsCreated: localGroups, aiUsed: false, aiError: aiResult.error };
    } else {
      allGroupIds = allGroupIds.concat(aiResult.createdGroupIds || []);
      result = { ok: true, groupsCreated: localGroups + aiResult.groupsCreated, aiUsed: true };
    }
  }
  if (allGroupIds.length) await recordLastAction({ type: "sort", windowId, groupIds: allGroupIds });
  return result;
}

async function hasApiKeyConfigured() {
  const { provider = "anthropic", anthropicApiKey, geminiApiKey } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey"]);
  return !!(provider === "gemini" ? geminiApiKey : anthropicApiKey);
}

async function ungroupAllTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groupedTabIds = tabs.filter(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).map(t => t.id);
  if (groupedTabIds.length) {
    try {
      await chrome.tabs.ungroup(groupedTabIds);
    } catch (err) {
      console.warn("Stax: ungroupAllTabs failed", err);
    }
  }
}

async function ungroupOne(groupId) {
  try {
    const tabs = await chrome.tabs.query({ groupId });
    const tabIds = tabs.map(t => t.id);
    if (tabIds.length) await chrome.tabs.ungroup(tabIds);
    return true;
  } catch (err) {
    console.warn("Stax: ungroupOne failed", err);
    return false;
  }
}

// Dedupes across ALL windows, matching the README's claim.
// `strict` compares raw URLs (the old behaviour). Default compares normalized
// URLs, which catches the same page opened from different links: tracking
// params stripped, fragment and trailing slash ignored, params sorted.
// The tab kept is always the oldest one, so focus doesn't jump unexpectedly.
async function removeDuplicates({ strict = false } = {}) {
  const tabs = await chrome.tabs.query({ pinned: false });
  const seen = new Set();
  const dups = [];
  const dupRecords = [];
  for (const tab of tabs) {
    if (!tab.url) continue;
    const key = strict ? tab.url : normalizeUrl(tab.url);
    if (seen.has(key)) {
      dups.push(tab.id);
      dupRecords.push({ url: tab.url, title: tab.title || "" });
    } else {
      seen.add(key);
    }
  }
  if (dups.length) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.tabs.remove(dups);
      await recordLastAction({ type: "dedupe", windowId: activeTab?.windowId, removedTabs: dupRecords });
    } catch (err) {
      console.warn("Stax: removeDuplicates failed", err);
    }
  }
  return dups.length;
}