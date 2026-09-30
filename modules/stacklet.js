// stacklet.js: Stacklet companion chat, action execution, allowlist.
// Depends on sort.js and actions.js.

// ---- Stacklet: the AI companion ----
// Same provider/key plumbing as grouping and search. Stacklet gets tab
// titles, hostnames, and current group membership, never page content,
// which would need scripting + <all_urls> and put real browsing data in a
// prompt. It replies in prose and may propose actions, but proposing is all
// it can do on its own: every action comes back to the UI as a confirm card
// unless the user has explicitly switched on auto-run.

const STACKLET_PROFILE_HINTS = {
  developer: "They mostly do software development. Notice things like docs left open across a task, a PR mid-review, or a stale localhost tab.",
  marketing: "They mostly do marketing. Notice campaign research, analytics dashboards, competitor pages, and draft/scheduling tools.",
  research: "They mostly research or study. Notice sources gathered for one topic, papers, and reference material worth grouping together.",
  design: "They mostly do design work. Notice inspiration boards, asset libraries, prototypes, and design tools.",
  general: "They use the browser for a mix of work and personal things."
};

// The only actions Stacklet is allowed to name. Anything outside this list
// is dropped before it ever reaches the UI, so a bad or adversarial model
// response can't invent a capability the extension doesn't intend to expose.
const ALLOWED_STACKLET_ACTIONS = new Set([
  "group_tabs", "close_tabs", "suspend_tabs", "rename_group", "save_session", "smart_sort", "dedupe", "open_tabs"
]);

// Hard ceiling on how many tabs one suggestion can open. Without it a single
// misread request ("open everything about X") could spawn dozens of tabs.
const MAX_TABS_PER_OPEN = 8;

// Only ever open real web pages. Blocks javascript:, data:, file: and
// chrome:// URLs, none of which should come out of a model response and all
// of which are worth refusing explicitly rather than relying on the prompt.
function isSafeOpenUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function buildStackletPrompt(tabs, groups, profile, history, userMessage) {
  const hint = STACKLET_PROFILE_HINTS[profile] || STACKLET_PROFILE_HINTS.general;
  return [
    "You are Stacklet, a concise, friendly assistant living inside a browser-tab manager called Stax.",
    `About this user: ${hint}`,
    "You can see the user's open tabs (title + hostname + group) and nothing else. You cannot read page content.",
    "",
    "Return ONLY raw JSON (no markdown fences, no prose outside the JSON) in this shape:",
    '{"reply":"a short friendly message, 1-3 sentences","actions":[{"type":"group_tabs","label":"Group 5 research tabs","tabIds":[1,2],"name":"Research","color":"cyan"}]}',
    "",
    "Action types you may use (omit 'actions' entirely if none make sense):",
    '- group_tabs: needs tabIds (2+), name, color. Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.',
    '- close_tabs: needs tabIds. Only for clear duplicates or obvious junk.',
    '- suspend_tabs: needs tabIds. Frees memory for tabs they are not using.',
    '- rename_group: needs groupId and title.',
    '- save_session: needs name.',
    '- smart_sort: no extra fields. Sorts everything with the local rule engine.',
    '- dedupe: no extra fields. Closes duplicate URLs.',
    '- open_tabs: needs urls (an array of full https:// URLs) and optionally groupName and color.',
    '    Use this to actually open useful material: documentation, references, search results,',
    '    papers, dashboards. Prefer well-known canonical URLs you are confident exist',
    '    (official docs, Wikipedia, MDN, GitHub repos, a search URL). Never invent deep links',
    '    to specific article slugs you are not sure about, since a wrong guess opens a 404.',
    `    Never more than ${MAX_TABS_PER_OPEN} URLs in one action.`,
    "",
    "Every action needs a short human 'label' explaining what it does. Never propose more than 3 actions.",
    "Be genuinely useful and specific about what you actually see. Do not invent tabs that are not listed.",
    "If the user asks you to find, research, or pull up material, use open_tabs rather than telling them you cannot open tabs.",
    "",
    `Open tabs: ${JSON.stringify(tabs)}`,
    `Existing groups: ${JSON.stringify(groups)}`,
    history.length ? `Recent conversation: ${JSON.stringify(history.slice(-6))}` : "",
    `User says: "${userMessage}"`
  ].filter(Boolean).join("\n");
}

function parseStackletReply(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed.reply !== "string") throw new Error("Malformed Stacklet response");
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  return {
    reply: parsed.reply,
    actions: actions
      .filter(a => a && ALLOWED_STACKLET_ACTIONS.has(a.type) && typeof a.label === "string")
      .slice(0, 3)
  };
}

async function callStackletProvider(promptText) {
  const { provider = "anthropic", anthropicApiKey, geminiApiKey, geminiModel = "gemini-flash-latest" } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey", "geminiModel"]);
  const apiKey = provider === "gemini" ? geminiApiKey : anthropicApiKey;
  if (!apiKey) return { ok: false, error: "no-key" };

  try {
    const raw = await fetchWithRetry(async () => {
      if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const err = new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
          err.status = res.status;
          throw err;
        }
        const data = await res.json();
        return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01",
                 // Required for calls made from a browser context.
                 // Without it the CORS preflight fails and fetch throws.
                 "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, messages: [{ role: "user", content: promptText }] })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return (data.content || []).map(b => b.text || "").join("");
    });
    return { ok: true, raw };
  } catch (err) {
    console.warn("Stax: Stacklet request failed", err);
    return { ok: false, error: err.message || "Stacklet request failed" };
  }
}

async function stackletChat(windowId, userMessage, history = []) {
  const { stackletProfile = "general" } = await chrome.storage.sync.get(["stackletProfile"]);

  const rawTabs = await chrome.tabs.query({ windowId, pinned: false });
  const groups = await chrome.tabGroups.query({ windowId });
  const tabs = rawTabs
    .filter(t => t.url && !/^(chrome|chrome-extension|brave|edge|edge-extension|moz-extension|about|file):/.test(t.url))
    .map(t => {
      let host = "";
      try { host = new URL(t.url).hostname; } catch { /* ignore malformed URL */ }
      return {
        id: t.id,
        title: (t.title || "").slice(0, 120),
        host,
        groupId: t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? t.groupId : null
      };
    });

  const groupSummaries = groups.map(g => ({ id: g.id, title: g.title || "", color: g.color }));
  const prompt = buildStackletPrompt(tabs, groupSummaries, stackletProfile, history, userMessage);

  const res = await callStackletProvider(prompt);
  if (!res.ok) return res;

  const { stackletAutoRun = false } = await chrome.storage.sync.get(["stackletAutoRun"]);

  try {
    const { reply, actions } = parseStackletReply(res.raw);
    return { ok: true, reply, actions, autoRun: !!stackletAutoRun };
  } catch (err) {
    // Malformed JSON is by far the most common failure a user actually sees,
    // and it's usually recoverable: the model wrapped the object in prose, or
    // trailed a comma. Hand the broken output and the parser error back once
    // and ask for just the JSON. One retry only, so a model that's genuinely
    // confused can't cost the user an unbounded number of calls.
    console.warn("Stax: Stacklet reply did not parse, attempting repair", err);

    const repairPrompt = [
      "Your previous response could not be parsed as JSON.",
      `The parser said: ${err.message}`,
      "",
      "Here is what you sent:",
      res.raw.slice(0, 1500),
      "",
      "Resend the same content as valid raw JSON only. No markdown fences, no",
      "text before or after the object. Shape:",
      '{"reply":"...","actions":[]}',
    ].join("\n");

    const retry = await callStackletProvider(repairPrompt);
    if (retry.ok) {
      try {
        const { reply, actions } = parseStackletReply(retry.raw);
        return { ok: true, reply, actions, autoRun: !!stackletAutoRun, repaired: true };
      } catch (err2) {
        console.warn("Stax: repair attempt also failed to parse", err2);
      }
    }

    // Last resort: if there's readable prose in the response, show it rather
    // than a generic error. A useful sentence with no actions attached beats
    // "I got confused there."
    const salvaged = res.raw
      .replace(/```[a-z]*|```/g, "")
      .replace(/[{}[\]"]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (salvaged.length > 25) {
      return { ok: true, reply: salvaged.slice(0, 400), actions: [], autoRun: false, degraded: true };
    }
    return { ok: false, error: "bad-response" };
  }
}

// Executes a single approved action. Every branch re-validates its inputs
// against live tabs rather than trusting ids from the model response,
// tabs close, groups disappear, and a stale id should fail cleanly instead
// of hitting an unrelated tab that happens to have reused the number.
async function runStackletAction(action, windowId) {
  if (!action || !ALLOWED_STACKLET_ACTIONS.has(action.type)) return { ok: false, error: "not-allowed" };

  try {
    if (action.type === "smart_sort") {
      const res = await runHybridSort(windowId);
      return { ok: true, detail: `Created ${res.groupsCreated} group(s).`, groupIds: res.groupIds || [] };
    }

    if (action.type === "dedupe") {
      const removed = await removeDuplicates();
      return { ok: true, detail: `Closed ${removed} duplicate tab(s).` };
    }

    if (action.type === "save_session") {
      const res = await saveSession(windowId, action.name || "Stacklet session");
      return res.ok ? { ok: true, detail: `Saved "${res.session.name}".` } : { ok: false, error: res.error };
    }

    if (action.type === "rename_group") {
      const ok = await renameGroup(action.groupId, action.title);
      return ok ? { ok: true, detail: `Renamed to "${action.title}".` } : { ok: false, error: "rename-failed" };
    }

    if (action.type === "open_tabs") {
      // Validated here rather than trusted from the response: bad protocols
      // are dropped, duplicates collapsed, and the count capped.
      const urls = [...new Set((action.urls || []).filter(isSafeOpenUrl))].slice(0, MAX_TABS_PER_OPEN);
      if (!urls.length) return { ok: false, error: "no-valid-urls" };

      const createdIds = [];
      for (const url of urls) {
        try {
          const tab = await chrome.tabs.create({ windowId, url, active: false });
          createdIds.push(tab.id);
        } catch (err) {
          console.warn("Stax: failed to open", url, err);
        }
      }
      if (!createdIds.length) return { ok: false, error: "open-failed" };

      // Group them on the way in if a name was given, so a research batch
      // doesn't just scatter across the tab strip.
      const madeGroups = [];
      if (action.groupName && createdIds.length >= 2) {
        const groupId = await safeGroup(createdIds, windowId, action.groupName, action.color || "cyan");
        if (groupId != null) {
          madeGroups.push(groupId);
          await recordLastAction({ type: "sort", windowId, groupIds: [groupId] });
        }
      }
      return { ok: true, detail: `Opened ${createdIds.length} tab(s).`, groupIds: madeGroups };
    }

    const liveTabs = await chrome.tabs.query({ windowId });
    const liveIds = new Set(liveTabs.map(t => t.id));
    const tabIds = (action.tabIds || []).filter(id => liveIds.has(id));
    if (!tabIds.length) return { ok: false, error: "no-valid-tabs" };

    if (action.type === "group_tabs") {
      if (tabIds.length < 2) return { ok: false, error: "need-two-tabs" };
      const groupId = await safeGroup(tabIds, windowId, action.name || "Stacklet", action.color || "grey");
      if (groupId == null) return { ok: false, error: "group-failed" };
      await recordLastAction({ type: "sort", windowId, groupIds: [groupId] });
      // Returned so the chat can render the group as a clickable chip
      // instead of just claiming it worked.
      return { ok: true, detail: `Grouped ${tabIds.length} tab(s).`, groupIds: [groupId] };
    }

    if (action.type === "suspend_tabs") {
      let count = 0;
      for (const id of tabIds) {
        try { await chrome.tabs.discard(id); count++; } catch (err) { /* tab may be active/audible */ }
      }
      return { ok: true, detail: `Suspended ${count} tab(s).` };
    }

    if (action.type === "close_tabs") {
      // Snapshot before closing so Undo can put them back, this is the one
      // action that destroys something the user can't otherwise recover.
      const records = liveTabs.filter(t => tabIds.includes(t.id)).map(t => ({ url: t.url, title: t.title || "" }));
      await chrome.tabs.remove(tabIds);
      await recordLastAction({ type: "dedupe", windowId, removedTabs: records });
      return { ok: true, detail: `Closed ${tabIds.length} tab(s).` };
    }

    return { ok: false, error: "not-allowed" };
  } catch (err) {
    console.warn("Stax: Stacklet action failed", err);
    return { ok: false, error: err.message || "action-failed" };
  }
}


// ---- Chat history persistence ----
// Conversations used to live only as long as the popup was open, which meant
// closing it lost everything Stacklet had told you and every action you'd
// approved. Persisted here instead.
//
// This does mean writing what you work on to disk, so it's bounded on both
// axes: a hard message cap, and an age cutoff. Plus a clear command, because
// "delete my history" should never require uninstalling.
const CHAT_KEY = "stax_chat_history";
const CHAT_MAX_MESSAGES = 60;
const CHAT_MAX_AGE_DAYS = 30;

async function loadChatHistory() {
  try {
    const { [CHAT_KEY]: raw = [] } = await chrome.storage.local.get([CHAT_KEY]);
    const cutoff = Date.now() - CHAT_MAX_AGE_DAYS * 86400000;
    const fresh = raw.filter(m => (m.at || 0) >= cutoff);
    // Prune on read rather than with a scheduled job: it costs nothing here
    // and there's no worker lifetime to depend on.
    if (fresh.length !== raw.length) {
      await chrome.storage.local.set({ [CHAT_KEY]: fresh });
    }
    return { ok: true, messages: fresh };
  } catch (err) {
    console.warn("Stax: loadChatHistory failed", err);
    return { ok: true, messages: [] };
  }
}

async function appendChatHistory(entries) {
  try {
    const { [CHAT_KEY]: raw = [] } = await chrome.storage.local.get([CHAT_KEY]);
    const stamped = entries.map(e => ({ ...e, at: e.at || Date.now() }));
    // Keep the newest CHAT_MAX_MESSAGES. Trimming from the front means a long
    // session loses its oldest turns rather than refusing to save new ones.
    const merged = [...raw, ...stamped].slice(-CHAT_MAX_MESSAGES);
    await chrome.storage.local.set({ [CHAT_KEY]: merged });
    return { ok: true };
  } catch (err) {
    console.warn("Stax: appendChatHistory failed", err);
    return { ok: false };
  }
}

async function clearChatHistory() {
  try {
    await chrome.storage.local.remove([CHAT_KEY]);
    return { ok: true };
  } catch (err) {
    return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "LOAD_CHAT") {
    loadChatHistory().then(sendResponse);
    return true;
  }
  if (msg.type === "APPEND_CHAT") {
    appendChatHistory(msg.entries).then(sendResponse);
    return true;
  }
  if (msg.type === "CLEAR_CHAT") {
    clearChatHistory().then(sendResponse);
    return true;
  }
});

// ---- Page summarisation (opt-in, per-tab consent) ----
// Stacklet normally sees tab titles and hostnames only. This is the single
// exception, and it's built so that the default state is genuinely no access
// rather than "access we promise not to use":
//
//   1. The extension installs with no host permissions at all
//   2. Turning the setting on triggers Chrome's own permission prompt
//   3. Even then, nothing is read until the user picks specific tabs
//   4. Only the tabs they picked are read, once, for that one request
//   5. Revoking in Settings actually revokes the browser permission
//
// The permission check runs on every read, not just at enable time, so
// revoking it externally (chrome://extensions) takes effect immediately.

const PAGE_READ_ORIGINS = { origins: ["http://*/*", "https://*/*"] };
const MAX_PAGE_CHARS = 6000;

async function hasPageAccess() {
  try {
    const [perm, origins] = await Promise.all([
      chrome.permissions.contains({ permissions: ["scripting"] }),
      chrome.permissions.contains(PAGE_READ_ORIGINS),
    ]);
    return perm && origins;
  } catch {
    return false;
  }
}

// NOTE: permissions.request() must be called from a user gesture inside an
// extension page. Invoking it from the service worker silently fails, so the
// request itself lives in popup.js and this only records the outcome.
async function recordPageAccess(granted) {
  await chrome.storage.sync.set({ pageReadEnabled: !!granted });
  return { ok: true, granted: !!granted };
}

async function revokePageAccess() {
  try {
    await chrome.permissions.remove({
      permissions: ["scripting"],
      origins: PAGE_READ_ORIGINS.origins,
    });
    await chrome.storage.sync.set({ pageReadEnabled: false });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Runs in the page. Pulls readable text and deliberately skips nav, script,
// style, and form fields: form values are the most sensitive thing on a page
// and there is no reason a summary would need them.
function extractReadableText() {
  const drop = ["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "input", "textarea", "select"];
  const clone = document.body.cloneNode(true);
  drop.forEach(sel => clone.querySelectorAll(sel).forEach(n => n.remove()));
  // Prefer the semantic content root when the page has one.
  const main = clone.querySelector("main, article, [role='main']") || clone;
  return (main.innerText || "").replace(/\s+/g, " ").trim();
}

// Reads one tab, but only after re-checking permission and confirming the
// tab id was in the approved set.
async function readTabContent(tabId, approvedIds) {
  if (!approvedIds.includes(tabId)) return null;
  if (!(await hasPageAccess())) return null;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https?:/.test(tab.url)) return null;

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractReadableText,
    });
    const text = (result?.result || "").slice(0, MAX_PAGE_CHARS);
    if (!text) return null;
    return { id: tabId, title: tab.title || "", url: tab.url, text };
  } catch (err) {
    // A tab can be a PDF, a restricted page, or already closed. None of
    // those are worth surfacing as an error; the summary just omits it.
    console.warn("Stax: could not read tab", tabId, err.message);
    return null;
  }
}

async function summarizeTabs(approvedIds) {
  if (!Array.isArray(approvedIds) || !approvedIds.length) {
    return { ok: false, error: "no-tabs-approved" };
  }
  if (!(await hasPageAccess())) return { ok: false, error: "no-permission" };

  const pages = [];
  for (const id of approvedIds) {
    const page = await readTabContent(id, approvedIds);
    if (page) pages.push(page);
  }
  if (!pages.length) return { ok: false, error: "nothing-readable" };

  const prompt = [
    "Summarise these web pages for someone deciding what to keep open.",
    "For each one: a single sentence on what it is, then one on whether it",
    "looks worth keeping. Be concrete and brief.",
    "",
    "Return ONLY raw JSON, no fences:",
    '{"summaries":[{"id":123,"what":"...","verdict":"..."}],"overall":"one sentence tying them together"}',
    "",
    JSON.stringify(pages.map(p => ({ id: p.id, title: p.title, text: p.text }))),
  ].join("\n");

  const res = await callStackletProvider(prompt);
  if (!res.ok) return res;

  try {
    const parsed = JSON.parse(res.raw.replace(/```json|```/g, "").trim());
    return {
      ok: true,
      summaries: Array.isArray(parsed.summaries) ? parsed.summaries : [],
      overall: parsed.overall || "",
      readCount: pages.length,
    };
  } catch (err) {
    return { ok: false, error: "bad-response" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PAGE_ACCESS_STATE") {
    hasPageAccess().then(granted => sendResponse({ ok: true, granted }));
    return true;
  }
  if (msg.type === "RECORD_PAGE_ACCESS") {
    recordPageAccess(msg.granted).then(sendResponse);
    return true;
  }
  if (msg.type === "REVOKE_PAGE_ACCESS") {
    revokePageAccess().then(sendResponse);
    return true;
  }
  if (msg.type === "SUMMARIZE_TABS") {
    summarizeTabs(msg.tabIds).then(sendResponse);
    return true;
  }
});