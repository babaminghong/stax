// ai.js: AI grouping (Anthropic + Gemini), retry logic, response parsing.
// Depends on sort.js (runAiSortOnTabs calls safeGroup).

// ---- AI Context Grouping ----

// Retries a fetch-returning function on transient overload errors
// (Gemini 503 UNAVAILABLE, Anthropic 529 overloaded) with exponential
// backoff. Anything else (bad key, malformed request) fails immediately,
// no point retrying a 401 or 400.
const RETRYABLE_STATUS = new Set([429, 500, 503, 529]);

async function fetchWithRetry(fn, { retries = 3, baseDelayMs = 800 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.status;
      const isRetryable = status && RETRYABLE_STATUS.has(status);
      if (!isRetryable || attempt === retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
      console.warn(`Stax: AI request got ${status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function callAnthropic(apiKey, tabSummaries) {
  return fetchWithRetry(async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: buildAiPrompt(tabSummaries) }]
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = (data.content || []).map(b => b.text || "").join("");
    return parseAiGroups(text);
  });
}

async function callGemini(apiKey, model, tabSummaries) {
  return fetchWithRetry(async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildAiPrompt(tabSummaries) }] }]
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    return parseAiGroups(text);
  });
}

function buildAiPrompt(tabSummaries) {
  return [
    "You are grouping browser tabs into short, meaningful categories based on their title and hostname.",
    "Return ONLY raw JSON (no markdown fences, no prose) matching this shape:",
    '{"groups":[{"name":"Short Group Name","color":"blue","tabIds":[1,2]}]}',
    "Valid colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.",
    "Only include a group if it has 2 or more tabs. Leave unrelated single tabs out entirely.",
    "Tabs:",
    JSON.stringify(tabSummaries)
  ].join("\n");
}

function parseAiGroups(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || !Array.isArray(parsed.groups)) throw new Error("Malformed AI response");
  return parsed.groups.filter(g => g && g.name && Array.isArray(g.tabIds) && g.tabIds.length >= 2);
}

// Full AI re-sort: runs on every unpinned tab in the window, ignoring
// whatever the local rules already did. Used by the standalone AI button.
async function runAiSort(windowId) {
  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  const result = await runAiSortOnTabs(windowId, tabs);
  if (result.ok && result.createdGroupIds?.length) {
    await recordLastAction({ type: "sort", windowId, groupIds: result.createdGroupIds });
  }
  return result;
}

// Shared core: groups exactly the tabs it's given. This is what lets hybrid
// sort point AI at only the leftover tabs instead of re-processing everything.
async function runAiSortOnTabs(windowId, tabs) {
  const { provider = "anthropic", anthropicApiKey, geminiApiKey, geminiModel = "gemini-flash-latest" } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey", "geminiModel"]);

  const apiKey = provider === "gemini" ? geminiApiKey : anthropicApiKey;
  if (!apiKey) return { ok: false, error: "no-key" };

  if (!tabs.length) return { ok: true, groupsCreated: 0 };

  const tabSummaries = tabs.map(t => {
    let host = "";
    try { host = new URL(t.url).hostname; } catch { /* ignore malformed URL */ }
    return { id: t.id, title: t.title || "", host };
  });

  let groups;
  try {
    groups = provider === "gemini"
      ? await callGemini(apiKey, geminiModel, tabSummaries)
      : await callAnthropic(apiKey, tabSummaries);
  } catch (err) {
    console.warn("Stax: AI sort failed", err);
    return { ok: false, error: err.message || "AI request failed" };
  }

  const validTabIds = new Set(tabs.map(t => t.id));
  let groupsCreated = 0;
  const createdGroupIds = [];
  for (const g of groups) {
    const tabIds = g.tabIds.filter(id => validTabIds.has(id));
    if (tabIds.length < 2) continue;
    const groupId = await safeGroup(tabIds, windowId, g.name, g.color || "grey");
    if (groupId != null) {
      groupsCreated++;
      createdGroupIds.push(groupId);
    }
  }

  return { ok: true, groupsCreated, createdGroupIds };
}

// ---- Message routing ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "LOCAL_SORT") {
    runLocalSort(msg.windowId)
      .then(({ groupsCreated }) => sendResponse({ ok: true, groupsCreated }))
      .catch(err => { console.warn("Stax: LOCAL_SORT failed", err); sendResponse({ ok: false, error: "sort-failed" }); });
    return true;
  }
  if (msg.type === "SMART_SORT") {
    runHybridSort(msg.windowId)
      .then(sendResponse)
      .catch(err => { console.warn("Stax: SMART_SORT failed", err); sendResponse({ ok: false, error: "sort-failed" }); });
    return true;
  }
  if (msg.type === "AI_SORT") {
    runAiSort(msg.windowId)
      .then(sendResponse)
      .catch(err => { console.warn("Stax: AI_SORT failed", err); sendResponse({ ok: false, error: "sort-failed" }); });
    return true;
  }
  if (msg.type === "UNGROUP_ALL") {
    ungroupAllTabs(msg.windowId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "UNGROUP_ONE") {
    ungroupOne(msg.groupId).then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === "REMOVE_DUPLICATES") {
    removeDuplicates().then(count => sendResponse({ ok: true, removed: count }));
    return true;
  }
});

// Wires up the Alt+S / Cmd+Shift+S hotkey declared in manifest.json.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick-sort") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) {
    try {
      await runLocalSort(tab.windowId);
    } catch (err) {
      console.warn("Stax: quick-sort command failed", err);
    }
  }
});

// ---- Auto-sort on new tab ----
// The Preferences toggle previously just wrote a value to storage that
// nothing ever read. This is the actual behavior: deliberately local-rules
// only (never AI), firing an API call on every single new tab would be