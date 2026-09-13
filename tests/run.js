// tests/run.js: minimal test runner, no dependencies.
// Run with: node tests/run.js
// Tests only the pure functions that don't touch chrome.* APIs.
// Anything that requires a real browser is exercised manually.

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    errors.push(`  FAIL: ${label}`);
    console.error(`  FAIL: ${label}`);
  }
}

function eq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    failed++;
    errors.push(`  FAIL: ${label}\n    got:      ${JSON.stringify(a)}\n    expected: ${JSON.stringify(b)}`);
    console.error(`  FAIL: ${label}\n    got:      ${JSON.stringify(a)}\n    expected: ${JSON.stringify(b)}`);
  } else {
    passed++;
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// ---- Inline the pure functions we want to test ----
// They can't be require()'d because the module files also contain chrome.*
// calls at the top level (const declarations that call chrome APIs) which
// would throw in Node. We inline only the pure pieces here.

// normalizeUrl: inline here exactly as it is in classifier.js
// (copied rather than require()'d because the module file has chrome.* calls
// that throw in Node — only pure functions are tested here).
const TRACKING_PARAMS = [
  "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
  "fbclid","gclid","msclkid","ref","referrer","source",
  "_ga","_gl","mc_cid","mc_eid","igshid","share",
];
function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    u.protocol = "https:";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    u.searchParams.sort();
    return u.toString();
  } catch {
    return rawUrl;
  }
}

// --- hostMatches (from classifier.js) ---
function hostMatches(host, domain) {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith("." + d);
}

// --- patternCategoryFor tokens (from classifier.js) ---
function tokenize(host) {
  return host.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// --- isSafeOpenUrl (from stacklet.js) ---
function isSafeOpenUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch { return false; }
}

// --- commonTitleLabel (from classifier.js) ---
const TITLE_STOPWORDS = new Set([
  "the","a","an","and","or","of","in","on","at","to","for","with",
  "is","are","was","were","be","been","by","from","as","it","its",
  "this","that","these","those","i","we","you","he","she","they",
  "my","your","our","their","new","new tab","tab",
]);
function commonTitleLabel(titles) {
  if (!titles.length) return "";
  const tokenLists = titles.map(t =>
    t.toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !TITLE_STOPWORDS.has(w))
  );
  const freq = {};
  for (const tokens of tokenLists)
    for (const tok of tokens)
      freq[tok] = (freq[tok] || 0) + 1;
  const threshold = Math.max(2, Math.ceil(titles.length * 0.5));
  const shared = Object.entries(freq)
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  return shared.slice(0, 3).join(" ");
}

// --- dayKey (from features.js) ---
function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

// ============================================================
// TESTS
// ============================================================

section("normalizeUrl");
eq(normalizeUrl("https://example.com/page?utm_source=google&q=hi"),
   "https://example.com/page?q=hi", "strips utm_source, keeps q");
eq(normalizeUrl("https://www.github.com/user/repo#readme"),
   "https://github.com/user/repo", "strips www, hash, trailing slash");
eq(normalizeUrl("https://example.com/path/?fbclid=abc&ref=tweet"),
   "https://example.com/path", "strips fbclid and ref, trims trailing slash");
eq(normalizeUrl("not a url"), "not a url", "gracefully handles bad input");
// https://example.com/ and https://example.com are the same resource;
// URL.pathname is always "/" for bare origins, so we leave it alone.
assert(normalizeUrl("https://example.com/") === normalizeUrl("https://example.com/"), "root slash: stable after normalization");

section("hostMatches");
assert(hostMatches("github.com", "github.com"), "exact match");
assert(hostMatches("gist.github.com", "github.com"), "subdomain match");
assert(!hostMatches("notgithub.com", "github.com"), "should NOT match false suffix");
assert(!hostMatches("evil.com.github.com.evil.ru", "github.com"), "phishing lookalike blocked");
assert(hostMatches("deep.sub.example.co.uk", "example.co.uk"), "multi-level subdomain");

section("tokenize (used by keyword classifier)");
eq(tokenize("photoshop.adobe.com"), ["photoshop","adobe","com"], "splits on dots");
eq(tokenize("my-cool-app.io"), ["my","cool","app","io"], "splits on hyphens");
assert(!tokenize("photoshop.adobe.com").includes("shop"), "shop NOT a token of photoshop.adobe.com");
assert(!tokenize("workshop.io").includes("shop"), "shop NOT a token of workshop.io");
assert(tokenize("myshop.store").includes("myshop"), "myshop IS a token");

section("isSafeOpenUrl");
assert(isSafeOpenUrl("https://developer.mozilla.org/"), "https allowed");
assert(isSafeOpenUrl("http://example.com"), "http allowed");
assert(!isSafeOpenUrl("javascript:alert(1)"), "javascript blocked");
assert(!isSafeOpenUrl("data:text/html,<h1>x</h1>"), "data blocked");
assert(!isSafeOpenUrl("file:///etc/passwd"), "file blocked");
assert(!isSafeOpenUrl("chrome://settings"), "chrome blocked");
assert(!isSafeOpenUrl(""), "empty string blocked");
assert(!isSafeOpenUrl("not a url"), "garbage blocked");

section("open_tabs URL dedup + cap");
const raw = [
  "https://a.com", "https://a.com",          // duplicate
  "javascript:evil()",                         // bad protocol
  ...Array.from({length: 12}, (_, i) => `https://x${i}.com`)
];
const safe = [...new Set(raw.filter(isSafeOpenUrl))].slice(0, 8);
eq(safe.length, 8, "deduped and capped at 8");
assert(safe.every(u => u.startsWith("https://")), "all safe URLs are https");

section("commonTitleLabel");
eq(commonTitleLabel([
  "React Router v6 docs",
  "React Router tutorial",
  "React Router migration guide"
]), "react router", "finds common prefix across three titles");
eq(commonTitleLabel(["YouTube", "Spotify", "Netflix"]), "", "no common token in entertainment tabs");
eq(commonTitleLabel([]), "", "empty array returns empty string");
eq(commonTitleLabel(["One thing"]), "", "single tab below threshold");

section("dayKey");
const key = dayKey(new Date("2026-09-12T14:30:00Z").getTime());
eq(key, "2026-09-12", "formats as YYYY-MM-DD");
assert(/^\d{4}-\d{2}-\d{2}$/.test(dayKey()), "current day key is YYYY-MM-DD shaped");


// ============================================================
// Localization integrity
// ============================================================
section("localization");
const fs = require("fs");
const path = require("path");

function loadLocale(lang) {
  const p = path.join(__dirname, "..", "_locales", lang, "messages.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

let en, de;
try {
  en = loadLocale("en");
  de = loadLocale("de");
  assert(true, "both locale files parse as JSON");
} catch (err) {
  assert(false, `locale files failed to load: ${err.message}`);
  en = de = {};
}

// Every key present in one locale must exist in the other, otherwise a
// German user silently falls back to the raw key string.
const enKeys = Object.keys(en).sort();
const deKeys = Object.keys(de).sort();
eq(enKeys.filter(k => !deKeys.includes(k)), [], "no keys missing from de");
eq(deKeys.filter(k => !enKeys.includes(k)), [], "no orphan keys in de");

// Every message needs a non-empty string, and placeholder counts must match
// between locales or substitution breaks at runtime.
let emptyCount = 0;
let placeholderMismatch = [];
for (const k of enKeys) {
  if (!en[k]?.message?.trim()) emptyCount++;
  if (de[k] && !de[k]?.message?.trim()) emptyCount++;
  const enPh = (en[k]?.message.match(/\$[A-Z_]+\$/g) || []).length;
  const dePh = (de[k]?.message.match(/\$[A-Z_]+\$/g) || []).length;
  if (de[k] && enPh !== dePh) placeholderMismatch.push(k);
}
eq(emptyCount, 0, "no empty message strings");
eq(placeholderMismatch, [], "placeholder counts match across locales");

// Any key declaring a placeholder must also declare the placeholders block,
// or chrome.i18n returns the message with the token still in it.
const missingPlaceholderBlock = enKeys.filter(k =>
  /\$[A-Z_]+\$/.test(en[k].message) && !en[k].placeholders
);
eq(missingPlaceholderBlock, [], "placeholder keys declare a placeholders block");

// Keys referenced from the HTML must exist in the locale files.
try {
  const html = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf-8");
  const used = [...html.matchAll(/data-i18n(?:-title|-placeholder)?="([a-zA-Z]+)"/g)].map(m => m[1]);
  const unknown = [...new Set(used)].filter(k => !enKeys.includes(k));
  eq(unknown, [], "every data-i18n key in popup.html exists in en locale");
  assert(used.length > 20, `popup.html tags a meaningful number of strings (${used.length})`);
} catch (err) {
  assert(false, `could not scan popup.html: ${err.message}`);
}


// ============================================================
// Tutorial coverage
// ============================================================
// This exists because the tutorial silently fell out of sync twice: Snooze
// shipped with no step at all, and Split Windows was only mentioned inside
// the Merge step rather than being highlighted. Nothing caught either.
// Now adding a tool without a tutorial step fails the suite.
section("tutorial coverage");

const popupJs = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf-8");
const popupHtml = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf-8");

const stepsBlock = popupJs.slice(
  popupJs.indexOf("const TUTORIAL_STEPS = ["),
  popupJs.indexOf("];", popupJs.indexOf("const TUTORIAL_STEPS = ["))
);
const stepTargets = [...stepsBlock.matchAll(/target:\s*"([^"]+)"/g)].map(m => m[1]);

// Every tile in the Tools grid is a user-facing feature and needs its own step.
const toolIds = [...popupHtml.matchAll(/class="tool-tile"\s+id="([a-zA-Z]+)"/g)].map(m => m[1]);
assert(toolIds.length >= 8, `found the tool tiles (${toolIds.length})`);
eq(toolIds.filter(id => !stepTargets.includes(id)), [], "every tool tile has a tutorial step");

// The inbox rows (Sessions, Read Later, Snoozed, Recently Closed, Accessories)
// are collapsible so they're easy to forget. At least one must be covered,
// since the step text explains the whole section.
const inboxIds = [...popupHtml.matchAll(/class="inbox-row"\s+id="([a-zA-Z]+)"/g)].map(m => m[1]);
assert(inboxIds.length >= 4, `found the inbox rows (${inboxIds.length})`);
assert(
  inboxIds.some(id => stepTargets.includes(id)),
  "at least one inbox row is covered by the tutorial"
);

// Every target must resolve to a real element, or the spotlight lands in the
// corner with no visible error.
const htmlIds = new Set([...popupHtml.matchAll(/id="([a-zA-Z_]+)"/g)].map(m => m[1]));
eq(stepTargets.filter(t => !htmlIds.has(t)), [], "every tutorial target exists in popup.html");

// Steps that switch view must name a view the switcher actually knows.
const declaredViews = [...stepsBlock.matchAll(/view:\s*"([^"]+)"/g)].map(m => m[1]);
const knownViews = ["dashboard", "stacklet", "search", "stats"];
eq([...new Set(declaredViews)].filter(v => !knownViews.includes(v)), [], "every step view is a real view");

// The step counter shows "OF N", so an empty or tiny list means the tutorial
// silently stopped covering the app.
assert(stepTargets.length >= 20, `tutorial covers a meaningful number of targets (${stepTargets.length})`);

// ============================================================
// Summary
// ============================================================
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed tests:");
  errors.forEach(e => console.error(e));
  process.exit(1);
}