// ---- Built-in category rules (domain lists, not free regex) ----
// Each rule lists exact registrable domains. hostMatches() only accepts
// an exact match or a proper subdomain, so "amazon.com.evil.ru" or
// "chatgpt.com.evil-phish.ru" can never match "amazon.com" / "chatgpt.com".
//
// This list is intentionally broad, including non-US/non-English sites
// (.de, .fr, .co.uk, .co.jp, etc.) — the goal is that local rules alone
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

// Local pattern classifier — the second line of defense before a domain
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
// (b) doesn't even give a better signal — a cookie tells you a site sets
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
  // category into the domain itself — about as reliable as a signal gets.
  for (const rule of PATTERN_RULES) {
    if (rule.hostSuffixes.some(suf => host.endsWith(suf))) return { name: rule.name, color: rule.color };
  }
  // Tier 2: hostname token match (the old keyword behavior, unchanged).
  for (const rule of PATTERN_RULES) {
    if (rule.hostKeywords.some(kw => tokens.includes(kw))) return { name: rule.name, color: rule.color };
  }
  // Tier 3: URL path shape — a checkout or PR-review URL looks the same
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

// Exact match or proper subdomain only — never a bare substring test.
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
  // and tab title — still 100% local/instant, no page content is read.
  const patternHit = patternCategoryFor(host, pathname, title);
  if (patternHit) return patternHit;

  // Last resort: bucket by root domain name, but only if enough tabs share
  // it — handled by the caller (runLocalSort), which knows the full tab list.
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
// which tabs it couldn't confidently place — the leftover list is what lets
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
  for (const [name, { color, tabIds, isFallback }] of groupsMap) {
    if (tabIds.length === 0) continue;
    if (isFallback && tabIds.length < MIN_TABS_FOR_FALLBACK_GROUP) continue; // no single-tab noise groups
    const groupId = await safeGroup(tabIds, windowId, name, color);
    if (groupId != null) {
      groupsCreated++;
      tabIds.forEach(id => groupedTabIds.add(id));
    }
  }

  const leftoverTabs = tabs.filter(t => !groupedTabIds.has(t.id) && !/^(chrome|brave|edge|about):/.test(t.url || ""));
  return { groupsCreated, leftoverTabs };
}

async function runLocalSort(windowId) {
  const { groupsCreated } = await runLocalSortCore(windowId);
  return { groupsCreated };
}

// Local rules first, then AI covers whatever's left over — the two engines
// used to be totally disconnected (AI only ever re-sorted everything from
// scratch on a separate button), so tabs the rule engine couldn't place
// just sat there even with a key configured. This is the fix for that.
async function runHybridSort(windowId) {
  const { groupsCreated: localGroups, leftoverTabs } = await runLocalSortCore(windowId);

  const hasKey = await hasApiKeyConfigured();
  if (!hasKey || leftoverTabs.length < 2) {
    return { ok: true, groupsCreated: localGroups, aiUsed: false };
  }

  const aiResult = await runAiSortOnTabs(windowId, leftoverTabs);
  if (!aiResult.ok) {
    // AI leg failing shouldn't erase the local-sort win — surface it as a
    // partial success rather than an error.
    return { ok: true, groupsCreated: localGroups, aiUsed: false, aiError: aiResult.error };
  }
  return { ok: true, groupsCreated: localGroups + aiResult.groupsCreated, aiUsed: true };
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
  for (const tab of tabs) {
    if (tab.url) {
      if (seen.has(tab.url)) dups.push(tab.id);
      else seen.add(tab.url);
    }
  }
  if (dups.length) {
    try {
      await chrome.tabs.remove(dups);
    } catch (err) {
      console.warn("Stax: removeDuplicates failed", err);
    }
  }
  return dups.length;
}

// ---- AI Context Grouping ----

// Retries a fetch-returning function on transient overload errors
// (Gemini 503 UNAVAILABLE, Anthropic 529 overloaded) with exponential
// backoff. Anything else (bad key, malformed request) fails immediately —
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
  return runAiSortOnTabs(windowId, tabs);
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
  for (const g of groups) {
    const tabIds = g.tabIds.filter(id => validTabIds.has(id));
    if (tabIds.length < 2) continue;
    const groupId = await safeGroup(tabIds, windowId, g.name, g.color || "grey");
    if (groupId != null) groupsCreated++;
  }

  return { ok: true, groupsCreated };
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
// only (never AI) — firing an API call on every single new tab would be
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