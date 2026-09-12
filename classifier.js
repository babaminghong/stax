// classifier.js: domain lists, pattern matching, URL normalization.
// Pure functions, no chrome.* calls, easy to unit-test in isolation.

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

// Query params that identify where a link came from, never what it points at.
// Stripping them is what turns "the same article opened from three places"
// into an actual duplicate rather than three distinct URLs.
const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "fbclid", "gclid", "gbraid", "wbraid", "msclkid", "twclid", "igshid", "ttclid",
  "ref", "ref_src", "referrer", "source", "mc_cid", "mc_eid", "yclid", "_ga",
  "spm", "scm", "at_medium", "at_campaign", "s_kwcid", "ck_subscriber_id"
];

// Canonical form for comparison only. Never navigate to this, only compare
// it: two URLs that normalize the same are treated as the same page.
function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    u.hash = "";                                     // #section is the same page
    u.hostname = u.hostname.replace(/^www\./, "");
    u.protocol = "https:";                           // http/https split is not a real difference here
    // Trailing slash only matters on a path, not on the root itself.
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    u.searchParams.sort();                           // param order should not create a "new" URL
    return u.toString();
  } catch {
    return rawUrl;
  }
}

// Words that appear in page titles everywhere and say nothing about the topic,
// so they should never end up being the name of a group.
const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "with", "your",
  "my", "you", "is", "are", "how", "what", "why", "docs", "documentation",
  "home", "page", "official", "site", "website", "online", "free", "best",
  "guide", "tutorial", "introduction", "intro", "overview", "get", "getting",
  "started", "new", "search", "results", "login", "sign", "up", "welcome"
]);

// Finds a shared label across a cluster of tab titles, so a fallback group
// can be named "React Router" instead of "reactrouter.com". Deliberately
// non-AI: it's instant, free, and works offline.
function commonTitleLabel(titles) {
  const tokenSets = titles
    .map(t => (t || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}+#.]+/u)
      .filter(w => w.length > 2 && !TITLE_STOPWORDS.has(w)))
    .filter(set => set.length);

  // Two titles is the minimum that can establish a *shared* label; one title
  // would just be that page's name masquerading as a category.
  if (tokenSets.length < 2) return null;

  // Keep only words present in most of the cluster. Requiring all of them is
  // too strict once a stray tab joins the group, so this uses a majority.
  const needed = Math.max(2, Math.ceil(tokenSets.length * 0.6));
  const counts = new Map();
  tokenSets.forEach(set => {
    new Set(set).forEach(w => counts.set(w, (counts.get(w) || 0) + 1));
  });

  const shared = [...counts.entries()]
    .filter(([, n]) => n >= needed)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 3)
    .map(([w]) => w);

  if (!shared.length) return null;

  // Re-case from the first title that contains the word, so acronyms and
  // product names keep their real capitalisation (API, PostgreSQL, iOS).
  // Words are then re-sorted into the order they actually appear in that
  // title, otherwise ranking by frequency produces "Router React".
  const reference = titles.find(t => shared.every(w => new RegExp(`\\b${w}\\b`, "i").test(t || ""))) || titles[0] || "";

  const label = shared
    .map(word => {
      const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const t of titles) {
        const m = (t || "").match(new RegExp(`\\b${safe}\\b`, "i"));
        if (m) return { word: m[0], pos: reference.toLowerCase().indexOf(word) };
      }
      return { word, pos: 9999 };
    })
    .sort((a, b) => (a.pos < 0 ? 9999 : a.pos) - (b.pos < 0 ? 9999 : b.pos))
    .map(x => x.word)
    .join(" ");

  return label.length > 26 ? label.slice(0, 26).trim() : label;
}

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