// ---- Built-in category rules (domain lists, not free regex) ----
// Each rule lists exact registrable domains. hostMatches() only accepts
// an exact match or a proper subdomain, so "amazon.com.evil.ru" or
// "chatgpt.com.evil-phish.ru" can never match "amazon.com" / "chatgpt.com".
//
// This list is intentionally broad, including non-US/non-English sites
// (.de, .fr, .co.uk, .co.jp, etc.), the goal is that local rules alone
// cover the large majority of everyday tabs, so AI is a genuine bonus for
// the long tail rather than something the tool leans on to work at all.
const BUILTIN_CATEGORY_RULES = [
  {
    name: "AI & ML",
    color: "purple",
    domains: ["chatgpt.com", "openai.com", "claude.ai", "gemini.google.com", "perplexity.ai", "huggingface.co", "replicate.com", "midjourney.com", "poe.com", "character.ai", "you.com"]
  },
  {
    name: "Development",
    color: "blue",
    domains: [
      "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com",
      "npmjs.com", "developer.mozilla.org", "vercel.com", "netlify.com", "supabase.com",
      "firebase.google.com", "codepen.io", "replit.com", "docker.com", "dev.to",
      "hashnode.com", "news.ycombinator.com", "leetcode.com", "codesandbox.io",
      "digitalocean.com", "cloudflare.com", "postman.com", "jsfiddle.net", "w3schools.com"
    ]
  },
  {
    name: "Social & Media",
    color: "pink",
    domains: [
      "youtube.com", "reddit.com", "twitter.com", "x.com", "instagram.com", "tiktok.com",
      "twitch.tv", "facebook.com", "linkedin.com", "bsky.app", "pinterest.com", "tumblr.com",
      "quora.com", "vk.com", "weibo.com", "xing.com"
    ]
  },
  {
    name: "Productivity",
    color: "yellow",
    domains: [
      "notion.so", "docs.google.com", "sheets.google.com", "slides.google.com", "drive.google.com",
      "trello.com", "asana.com", "jira.atlassian.com", "confluence.atlassian.com", "figma.com",
      "miro.com", "monday.com", "clickup.com", "airtable.com", "canva.com", "dropbox.com",
      "onedrive.live.com", "office.com", "evernote.com", "todoist.com", "calendly.com"
    ]
  },
  {
    name: "Communication",
    color: "cyan",
    domains: [
      "mail.google.com", "outlook.live.com", "outlook.office.com", "slack.com", "discord.com",
      "telegram.org", "web.whatsapp.com", "teams.microsoft.com", "zoom.us", "meet.google.com",
      "web.skype.com", "gmx.de", "gmx.net", "web.de", "t-online.de", "mail.yahoo.com", "protonmail.com"
    ]
  },
  {
    name: "Finance & Pay",
    color: "green",
    domains: [
      "paypal.com", "stripe.com", "wise.com", "revolut.com", "coinbase.com", "robinhood.com",
      "chase.com", "bankofamerica.com", "n26.com", "sparkasse.de", "ing.de", "dkb.de",
      "commerzbank.de", "deutsche-bank.de", "boursorama.com", "santander.co.uk", "hsbc.co.uk",
      "monzo.com", "binance.com", "kraken.com"
    ]
  },
  {
    name: "Shopping",
    color: "orange",
    domains: [
      "amazon.com", "amazon.de", "amazon.co.uk", "amazon.fr", "amazon.co.jp", "amazon.ca",
      "ebay.com", "ebay.de", "ebay.co.uk", "etsy.com", "aliexpress.com", "target.com",
      "walmart.com", "shopify.com", "otto.de", "idealo.de", "mediamarkt.de", "saturn.de",
      "zalando.de", "zalando.com", "cdiscount.com", "leboncoin.fr", "fnac.com",
      "mercadolibre.com", "rakuten.co.jp", "rakuten.com", "wayfair.com", "ikea.com"
    ]
  },
  {
    name: "Entertainment",
    color: "red",
    domains: [
      "netflix.com", "spotify.com", "hulu.com", "disneyplus.com", "primevideo.com",
      "soundcloud.com", "crunchyroll.com", "deezer.com", "steampowered.com", "epicgames.com",
      "vimeo.com", "dailymotion.com"
    ]
  },
  {
    name: "News & Reading",
    color: "cyan",
    domains: [
      "wikipedia.org", "medium.com", "substack.com", "nytimes.com", "bbc.com", "bbc.co.uk",
      "cnn.com", "theguardian.com", "reuters.com", "bloomberg.com", "spiegel.de", "zeit.de",
      "faz.net", "bild.de", "sueddeutsche.de", "tagesschau.de", "lemonde.fr", "lefigaro.fr",
      "elpais.com", "corriere.it", "asahi.com"
    ]
  },
  {
    name: "Travel",
    color: "purple",
    domains: [
      "booking.com", "airbnb.com", "expedia.com", "tripadvisor.com", "skyscanner.com",
      "kayak.com", "hotels.com", "ryanair.com", "lufthansa.com", "deutschebahn.com", "bahn.de",
      "sncf.com", "trainline.com"
    ]
  }
];

// Local pattern classifier, the second line of defense before a domain
// falls into the generic grey bucket. Instead of maintaining an ever-growing
// list of exact domains, this matches structural signals that hold across
// sites nobody's ever added by name: the TLD a business registered under,
// words in the hostname itself, the URL path shape (a checkout flow looks
// like a checkout flow on any storefront), and the tab title. Checked in
// that order, strongest signal first, so a weak title match never
// pre-empts a strong domain-suffix match from a later rule.
//
// Deliberately NOT using cookies or request-trace data for this. Reading
// cookies would need the "cookies" permission plus broad host_permissions
// (effectively <all_urls>), which (a) is real user data leaving the "stored
// locally, works on tab metadata only" model the rest of Stax follows, and
// (b) doesn't even give a better signal, a cookie tells you a site sets
// trackers, not what category it is. URL/title patterns cover the same
// ground without touching page content or expanding what Stax can see.
const PATTERN_RULES = [
  {
    name: "Shopping",
    color: "orange",
    hostSuffixes: [".shop", ".store"],
    hostKeywords: ["shop", "store", "kaufen", "shopping", "boutique", "market", "deals", "outlet"],
    pathPatterns: [/^\/(cart|checkout|basket|panier|warenkorb|carrito|carrello)(\/|$)/i],
    titlePatterns: [/\b(shopping cart|add to cart|warenkorb|panier|zum warenkorb)\b/i]
  },
  {
    name: "Finance & Pay",
    color: "green",
    hostSuffixes: [".bank"],
    hostKeywords: ["bank", "banque", "banca", "finance", "geld", "payment", "invest"],
    pathPatterns: [/^\/(invoice|rechnung|facture|statement|kontoauszug)(\/|$)/i],
    titlePatterns: [/\b(invoice|rechnung|account balance|kontostand)\b/i]
  },
  {
    name: "Travel",
    color: "purple",
    hostSuffixes: [".travel", ".flights"],
    hostKeywords: ["travel", "flight", "flug", "hotel", "reise", "voyage", "airlines"],
    pathPatterns: [/^\/(flight|flug|booking|reservation|itinerary)s?(\/|$)/i],
    titlePatterns: [/\b(boarding pass|check-?in|flight status|booking confirm(ed|ation))\b/i]
  },
  {
    name: "News & Reading",
    color: "cyan",
    hostSuffixes: [".news"],
    hostKeywords: ["news", "nachrichten", "aktuell", "zeitung", "journal", "presse", "actualite", "noticias"],
    pathPatterns: [/^\/(article|story|nachricht|breaking)s?(\/|$)/i],
    titlePatterns: []
  },
  {
    name: "Development",
    color: "blue",
    hostSuffixes: [".dev"],
    hostKeywords: ["docs", "dev", "api", "sdk", "github"],
    pathPatterns: [/^\/[^/]+\/[^/]+\/(pull|issues|commit|blob|tree|compare|releases)(\/|$)/i],
    titlePatterns: [/\b(pull request|merge request|\d+ commits?|compare changes)\b/i]
  }
];

function patternCategoryFor(host, pathname, title) {
  const tokens = host.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const path = (pathname || "").toLowerCase();
  const titleLower = (title || "").toLowerCase();

  // Tier 1: TLD/host suffix. Registering under .shop or .bank bakes the
  // category into the domain itself, about as reliable as a signal gets.
  for (const rule of PATTERN_RULES) {
    if (rule.hostSuffixes.some(suf => host.endsWith(suf))) return { name: rule.name, color: rule.color };
  }
  // Tier 2: hostname token match (the old keyword behavior, unchanged).
  for (const rule of PATTERN_RULES) {
    if (rule.hostKeywords.some(kw => tokens.includes(kw))) return { name: rule.name, color: rule.color };
  }
  // Tier 3: URL path shape, a checkout or PR-review URL looks the same
  // structurally on almost any storefront or git host, listed or not.
  for (const rule of PATTERN_RULES) {
    if (rule.pathPatterns.some(p => p.test(path))) return { name: rule.name, color: rule.color };
  }
  // Tier 4: tab title. Weakest signal (titles are the noisiest source), so
  // it only gets checked once nothing structural has matched at all.
  for (const rule of PATTERN_RULES) {
    if (rule.titlePatterns.some(p => p.test(titleLower))) return { name: rule.name, color: rule.color };
  }
  return null;
}

const MIN_TABS_FOR_FALLBACK_GROUP = 2;

// Exact match or proper subdomain only, never a bare substring test.
function hostMatches(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

async function getAllRules() {
  const { customRules = [] } = await chrome.storage.sync.get(["customRules"]);
  // customRules: [{ domains: ["a.com","b.com"], name: "Work", color: "blue" }, ...]
  // Custom rules are checked first so a user can override a built-in category.
  const normalizedCustom = customRules
    .filter(r => r && r.name && Array.isArray(r.domains) && r.domains.length)
    .map(r => ({ name: r.name, color: r.color || "grey", domains: r.domains }));
  return [...normalizedCustom, ...BUILTIN_CATEGORY_RULES];
}

async function getCategoryForTab(url, rules, title) {
  // chrome-extension:// and moz-extension:// weren't covered by the old regex
  // (it only matched "chrome:", not "chrome-extension:"), so extension pages
  // like the built-in PDF viewer could slip through and get dumped into a
  // grey group named after the extension ID.
  if (!url || /^(chrome|chrome-extension|brave|edge|edge-extension|moz-extension|about|file):/.test(url)) return null;
  let host, pathname;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    pathname = parsed.pathname;
  } catch (err) {
    console.warn("Stax: could not parse tab URL", url, err);
    return null;
  }

  if (isLocalHost(host)) {
    return { name: "Development", color: "blue" };
  }

  for (const rule of rules) {
    if (rule.domains.some(d => hostMatches(host, d))) {
      return { name: rule.name, color: rule.color };
    }
  }

  // Second pass: pattern match across TLD, hostname tokens, URL path shape,
  // and tab title, still 100% local/instant, no page content is read.
  const patternHit = patternCategoryFor(host, pathname, title);
  if (patternHit) return patternHit;

  // Last resort: bucket by root domain name, but only if enough tabs share
  // it, handled by the caller (runLocalSort), which knows the full tab list.
  const cleanHost = host.replace(/^www\./, "").split(".")[0];
  if (cleanHost && cleanHost.length > 2) {
    return { name: cleanHost.toUpperCase(), color: "grey", isFallback: true };
  }
  return null;
}

async function safeGroup(tabIds, windowId, title, color) {
  try {
    const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title, color });
    return groupId;
  } catch (err) {
    // A tab can close mid-sort; don't let that kill the whole handler.
    console.warn(`Stax: failed to group "${title}"`, err);
    return null;
  }
}

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
        groupsMap.set(cat.name, { color: cat.color, tabIds: [], isFallback: !!cat.isFallback });
      }
      groupsMap.get(cat.name).tabIds.push(tab.id);
    }
  }

  let groupsCreated = 0;
  const createdGroupIds = [];
  for (const [name, { color, tabIds, isFallback }] of groupsMap) {
    if (tabIds.length === 0) continue;
    if (isFallback && tabIds.length < MIN_TABS_FOR_FALLBACK_GROUP) continue; // no single-tab noise groups
    const groupId = await safeGroup(tabIds, windowId, name, color);
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
async function removeDuplicates() {
  const tabs = await chrome.tabs.query({ pinned: false });
  const seen = new Set();
  const dups = [];
  const dupRecords = [];
  for (const tab of tabs) {
    if (tab.url) {
      if (seen.has(tab.url)) {
        dups.push(tab.id);
        dupRecords.push({ url: tab.url, title: tab.title || "" });
      } else {
        seen.add(tab.url);
      }
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
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
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

  try {
    const { reply, actions } = parseStackletReply(res.raw);
    const { stackletAutoRun = false } = await chrome.storage.sync.get(["stackletAutoRun"]);
    return { ok: true, reply, actions, autoRun: !!stackletAutoRun };
  } catch (err) {
    console.warn("Stax: could not parse Stacklet reply", err);
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
      return { ok: true, detail: `Created ${res.groupsCreated} group(s).` };
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
      if (action.groupName && createdIds.length >= 2) {
        const groupId = await safeGroup(createdIds, windowId, action.groupName, action.color || "cyan");
        if (groupId != null) await recordLastAction({ type: "sort", windowId, groupIds: [groupId] });
      }
      return { ok: true, detail: `Opened ${createdIds.length} tab(s).` };
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
      return { ok: true, detail: `Grouped ${tabIds.length} tab(s).` };
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
});