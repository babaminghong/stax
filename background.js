// Runs as a Manifest V3 service worker. Two jobs:
//   1. Instant local sort — pure JS, no network, runs on tab changes.
//   2. AI sort — only runs when the user asks for it, via the popup.

const MANAGED_GROUPS_KEY = "managedGroupIds";
const LAST_AI_CALL_KEY = "lastAiCallTs";
const AI_COOLDOWN_MS = 15_000;

const LOCAL_RULES = [
  { name: "Dev", color: "blue", test: (h, u) =>
      /github\.com|gitlab\.com|stackoverflow\.com|developer\.mozilla\.org|npmjs\.com|localhost|127\.0\.0\.1/.test(h) },
  { name: "Docs", color: "cyan", test: (h, u) =>
      /^docs\.|readthedocs\.io|notion\.so/.test(h) || /\/docs\//.test(u) },
  { name: "Comms", color: "purple", test: (h) =>
      /mail\.google\.com|outlook\.(live|office)\.com|slack\.com|discord\.com/.test(h) },
  { name: "Shopping", color: "orange", test: (h) =>
      /amazon\.|ebay\.|etsy\.com/.test(h) },
  { name: "Distraction", color: "pink", test: (h) =>
      /youtube\.com|reddit\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|facebook\.com/.test(h) },
];

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

function localCategoryFor(tab) {
  const h = hostnameOf(tab.url || "");
  const u = tab.url || "";
  for (const rule of LOCAL_RULES) {
    if (rule.test(h, u)) return { name: rule.name, color: rule.color };
  }
  return { name: h.replace(/^www\./, "") || "Other", color: "grey" };
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
  clearTimeout(localSortTimer);
  localSortTimer = setTimeout(() => runLocalSort(windowId), 400);
}

async function runLocalSort(windowId) {
  const { autoSortEnabled } = await chrome.storage.local.get("autoSortEnabled");
  if (autoSortEnabled === false) return;

  const tabs = await chrome.tabs.query({ windowId });
  const assignments = tabs
    .filter((t) => t.url && !t.pinned)
    .map((t) => {
      const { name, color } = localCategoryFor(t);
      return { tabId: t.id, group: name, color };
    });
  if (assignments.length) await applyGrouping(assignments, windowId);
}

chrome.tabs.onCreated.addListener((tab) => scheduleLocalSort(tab.windowId));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") scheduleLocalSort(tab.windowId);
});

const SYSTEM_PROMPT = [
  "You group browser tabs into short, human-readable categories (2-4 total, name each 1-2 words).",
  "Pick a color for each category from exactly this list: grey, blue, red, yellow, green, pink, purple, cyan, orange.",
  "Reply with ONLY a JSON array, no prose, no markdown fences. Each item: {\"id\": number, \"group\": string, \"color\": string}.",
  "Every input id must appear exactly once in the output.",
].join(" ");

async function callAnthropic(apiKey, payload) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }),
  });
  if (!resp.ok) return { text: null, status: resp.status };
  const data = await resp.json();
  const text = (data.content || []).map((b) => b.text || "").join("").trim();
  return { text, status: resp.status };
}

async function callGemini(apiKey, model, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nTabs:\n${JSON.stringify(payload)}` }] }],
      generationConfig: { response_mime_type: "application/json" },
    }),
  });
  if (!resp.ok) return { text: null, status: resp.status };
  const data = await resp.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  return { text, status: resp.status };
}

function friendlyError(provider, status) {
  if (status === 401 || status === 403) {
    return `That ${provider === "gemini" ? "Gemini" : "Anthropic"} API key was rejected. Double-check it in options.`;
  }
  if (status === 429) return "Rate limited — try again shortly.";
  if (status === 400) return "The model rejected the request — try again, or check the model name in options.";
  return `API error (${status ?? "network"}).`;
}

async function runAiSort(windowId) {
  const { provider = "anthropic", anthropicApiKey, geminiApiKey, geminiModel = "gemini-flash-latest" } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey", "geminiModel"]);

  const key = provider === "gemini" ? geminiApiKey : anthropicApiKey;
  if (!key) {
    return { ok: false, error: `No ${provider === "gemini" ? "Gemini" : "Anthropic"} API key saved yet. Add one in the extension options.` };
  }

  const { [LAST_AI_CALL_KEY]: lastTs } = await chrome.storage.local.get(LAST_AI_CALL_KEY);
  if (lastTs && Date.now() - lastTs < AI_COOLDOWN_MS) {
    return { ok: false, error: "Give it a few seconds between AI sorts." };
  }

  const tabs = await chrome.tabs.query({ windowId });
  const usable = tabs.filter((t) => t.url && !t.pinned);
  if (!usable.length) return { ok: false, error: "No tabs to sort." };

  const payload = usable.map((t) => ({
    id: t.id,
    title: (t.title || "").slice(0, 120),
    host: hostnameOf(t.url),
  }));

  let result;
  try {
    result = provider === "gemini"
      ? await callGemini(key, geminiModel, payload)
      : await callAnthropic(key, payload);
  } catch {
    return { ok: false, error: "Couldn't reach the API. Check your connection." };
  }

  if (!result.text) return { ok: false, error: friendlyError(provider, result.status) };

  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return { ok: false, error: "Model reply wasn't valid JSON — try again." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "Unexpected model reply shape." };

  const ALLOWED = new Set(["grey","blue","red","yellow","green","pink","purple","cyan","orange"]);
  const validIds = new Set(usable.map((t) => t.id));
  const assignments = parsed
    .filter((a) => validIds.has(a.id) && typeof a.group === "string" && ALLOWED.has(a.color))
    .map((a) => ({ tabId: a.id, group: a.group.slice(0, 24), color: a.color }));

  if (!assignments.length) return { ok: false, error: "Model didn't return usable groupings." };

  await applyGrouping(assignments, windowId);
  await chrome.storage.local.set({ [LAST_AI_CALL_KEY]: Date.now() });
  return { ok: true, count: assignments.length };
}

async function moveTabToGroup(tabId, groupName, windowId) {
  if (groupName === "__ungroup__") {
    await chrome.tabs.ungroup(tabId);
    return { ok: true };
  }
  const managed = await getManagedGroupIds();
  const existingId = managed[groupName];
  try {
    if (existingId) {
      await chrome.tabGroups.get(existingId);
      await chrome.tabs.group({ tabIds: [tabId], groupId: existingId });
    } else {
      const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title: groupName, color: "grey" });
      managed[groupName] = groupId;
      await setManagedGroupIds(managed);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't move that tab." };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "AI_SORT") {
    runAiSort(msg.windowId).then(sendResponse);
    return true;
  }
  if (msg.type === "LOCAL_SORT") {
    runLocalSort(msg.windowId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "MOVE_TAB") {
    moveTabToGroup(msg.tabId, msg.groupName, msg.windowId).then(sendResponse);
    return true;
  }
});