// Shared between popup.js and sidepanel.js. Both surfaces show the same
// tab-group data and talk to the background worker the same way, so the
// glyph lookup, messaging helper, and HTML escaping used to be copy-pasted
// in both files. Load this before popup.js / sidepanel.js in their HTML.

// Category badges. Drawn as compact vectors rather than the mixed bag of
// ASCII and box-drawing characters that was here before, which rendered at
// wildly different optical weights next to each other.
const CATEGORY_GLYPHS = {
  "AI & ML":        '<path d="M12 4l1.7 4.1L18 10l-4.3 1.9L12 16l-1.7-4.1L6 10l4.3-1.9z"/>',
  "Development":    '<path d="M8.5 8L5 12l3.5 4M15.5 8L19 12l-3.5 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  "Social & Media": '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.4"/>',
  "Productivity":   '<path d="M5 6.5h14M5 12h14M5 17.5h9" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  "Communication":  '<path d="M5 6.5h14a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0119 16.5h-7l-4 3.5v-3.5H5A1.5 1.5 0 013.5 15V8A1.5 1.5 0 015 6.5z"/>',
  "Finance & Pay":  '<path d="M12 4v16M15.5 8c0-1.7-1.6-2.5-3.5-2.5S8.5 6.4 8.5 8.2s1.6 2.3 3.5 2.8 3.7 1 3.7 2.9-1.8 2.6-3.7 2.6-3.5-.9-3.5-2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  "Shopping":       '<path d="M6 8h12l-1.2 11H7.2z"/><path d="M9 8V6a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="2"/>',
  "Entertainment":  '<path d="M9 6.5l9 5.5-9 5.5z"/>',
  "News & Reading": '<path d="M5 5.5h11a1.5 1.5 0 011.5 1.5v11H6.5A1.5 1.5 0 015 17.5z"/><path d="M8 9h5M8 12h5M8 15h3" fill="none" stroke="var(--card-bg-solid)" stroke-width="1.6" stroke-linecap="round"/>',
  "Travel":         '<path d="M12 3l2.2 7.2 6.8 2-6.8 2L12 21l-2.2-6.8L3 12.2l6.8-2z"/>',
};

function glyphFor(name) {
  const path = CATEGORY_GLYPHS[name];
  if (path) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="currentColor">${path}</svg>`;
  }
  // Unlisted or AI-invented group names fall back to initials, which is
  // still better than a generic icon that implies a category we didn't pick.
  return `<span class="badge-initials">${(name || "?").replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 2).toUpperCase() || "?"}</span>`;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(res));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// The accent presets available in Settings. Each id matches a
// :root[data-accent="id"] block in popup.css; `swatch` is only used to paint
// the picker button itself, so the CSS stays the single source of truth for
// what a theme actually looks like.
const ACCENT_PRESETS = [
  { id: "sunrise",  label: "Sunrise",  swatch: "#f7c948" },
  { id: "orchid",   label: "Orchid",   swatch: "#c9a7f5" },
  { id: "mint",     label: "Mint",     swatch: "#9ee0be" },
  { id: "ocean",    label: "Ocean",    swatch: "#8fc4f7" },
  { id: "ember",    label: "Ember",    swatch: "#f7a978" },
  { id: "rose",     label: "Rose",     swatch: "#f5a9c4" },
  { id: "graphite", label: "Graphite", swatch: "#b9b5ab" },
  { id: "aurora",   label: "Aurora",   swatch: "linear-gradient(135deg,#c9a7f5,#a8e6cf 50%,#f7c948)" },
  { id: "sunset",   label: "Sunset",   swatch: "linear-gradient(135deg,#f7c948,#f7b199 50%,#c9a7f5)" }
];

function applyAccent(accent) {
  // "sunrise" is the built-in default that lives in :root, so it needs no
  // attribute, setting one would just be a redundant override.
  if (!accent || accent === "sunrise") document.documentElement.removeAttribute("data-accent");
  else document.documentElement.setAttribute("data-accent", accent);
}

// Applied as early as possible (before anything paints) to avoid a
// light-then-dark flash when the saved theme differs from the OS setting.
// Same stored values in both popup and side panel, so they always match.
(async function applyThemeEarly() {
  const { theme = "auto", accent = "sunrise" } = await chrome.storage.sync.get(["theme", "accent"]);
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  applyAccent(accent);
})();



// ---- Localization ----
// Strings live in _locales/<lang>/messages.json and are resolved by the
// browser against the user's UI language. Markup declares a key with
// data-i18n and localizeDom() fills it in, which keeps the HTML readable
// rather than littering it with lookup calls.
//
// t() falls back to the key itself when a message is missing, so an
// untranslated string shows up obviously in testing instead of rendering
// as an empty element.
function t(key, ...subs) {
  try {
    const msg = chrome.i18n.getMessage(key, subs.length ? subs.map(String) : undefined);
    return msg || key;
  } catch {
    return key;
  }
}

// data-i18n replaces text content; data-i18n-title sets the tooltip;
// data-i18n-placeholder handles inputs. An element can use more than one.
function localizeDom(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    const msg = t(el.dataset.i18n);
    if (msg === el.dataset.i18n) return; // no translation, leave the markup
    // Only replace text nodes so nested icons survive the swap.
    const textNode = Array.from(el.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = msg;
    else el.appendChild(document.createTextNode(msg));
  });
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    const msg = t(el.dataset.i18nTitle);
    if (msg !== el.dataset.i18nTitle) el.title = msg;
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const msg = t(el.dataset.i18nPlaceholder);
    if (msg !== el.dataset.i18nPlaceholder) el.placeholder = msg;
  });
  // Mark the document language so :lang() rules and hyphenation behave.
  try { document.documentElement.lang = chrome.i18n.getUILanguage(); } catch {}
}

// ---- Icon system ----
// A single stroke-based set drawn on a 24x24 grid, inheriting currentColor.
// Replaces the emoji that were standing in for icons: emoji render
// differently on every OS, can't inherit theme colour, sit off-baseline,
// and read as placeholder art. These are consistent everywhere.
const ICON_PATHS = {
  // navigation
  layers:    '<path d="M3 7h18M3 12h18M3 17h11"/>',
  bot:       '<rect x="4" y="9" width="16" height="11" rx="4"/><path d="M12 9V5"/><circle cx="12" cy="4" r="1.6"/><circle cx="9" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
  search:    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  chart:     '<path d="M4 20V13M10 20V7M16 20v-5M22 20V4"/>',
  gear:      '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M3.4 7.2l2.6 1.5M18 15.3l2.6 1.5M3.4 16.8l2.6-1.5M18 8.7l2.6-1.5"/>',

  // primary action
  bolt:      '<path d="M13.5 2L5 13h5.5l-1 9L19 11h-5.5z"/>',
  sparkle:   '<path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',

  // tools
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M15.5 4.5H6A2.5 2.5 0 003.5 7v9.5"/>',
  moon:      '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 100 17 8.5 8.5 0 0010.5-6.5z"/>',
  target:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  box:       '<path d="M21 8.5v7.2a2 2 0 01-1.1 1.8l-7 3.4a2 2 0 01-1.8 0l-7-3.4A2 2 0 013 15.7V8.5"/><path d="M3.3 7.6l8.1-3.9a2 2 0 011.2 0l8.1 3.9-8.7 4.2z"/><path d="M12 11.8V21"/>',
  inbox:     '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M4.4 5.6h15.2a1.5 1.5 0 011.4 1.9l-1.6 6.4V18a2 2 0 01-2 2H6.6a2 2 0 01-2-2v-4.1L3 7.5a1.5 1.5 0 011.4-1.9z"/>',
  merge:     '<path d="M3 6h5l4 6 4-6h5"/><path d="M18 18l3-3-3-3"/><path d="M3 15h18"/>',
  split:     '<path d="M12 3v8"/><path d="M5 21V13h14v8"/><path d="M9 7l3-4 3 4"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16" rx="2.5"/><path d="M9 3.5h6v3H9z"/><path d="M9 11h6M9 15h4"/>',

  // small affordances
  undo:      '<path d="M4 9h9.5a5.5 5.5 0 010 11H8"/><path d="M7.5 5L4 9l3.5 4"/>',
  folder:    '<path d="M3.5 7.5A2 2 0 015.5 5.5h3.4l2 2.6h7.6a2 2 0 012 2v7.4a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  close:     '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron:   '<path d="M9 5l7 7-7 7"/>',
  refresh:   '<path d="M20 6v5h-5"/><path d="M19.4 11A7.5 7.5 0 006 7.5L4 9.5"/><path d="M4 18v-5h5"/><path d="M4.6 13a7.5 7.5 0 0013.4 3.5l2-2"/>',
};

// Filled-shape icons live separately because a stroke grid can't express
// them cleanly (a solid disc needs fill, not a path outline).
const ICON_FILLED = new Set(["bolt", "sparkle", "moon", "folder", "box"]);

function icon(name, size = 18, extraClass = "") {
  const body = ICON_PATHS[name];
  if (!body) return "";
  const filled = ICON_FILLED.has(name);
  return `<svg class="icn ${extraClass}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="${filled ? 0 : 1.7}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// Stacklet's own face, reused for the mood readout so the stat strip and the
// character can never disagree about how he's feeling.
function moodFace(mood = "happy", size = 22) {
  const faces = {
    happy:    '<circle cx="9" cy="10" r="1.4" fill="currentColor"/><circle cx="15" cy="10" r="1.4" fill="currentColor"/><path d="M8.5 14.5Q12 17.5 15.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    neutral:  '<circle cx="9" cy="10" r="1.4" fill="currentColor"/><circle cx="15" cy="10" r="1.4" fill="currentColor"/><path d="M8.5 15h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    stressed: '<path d="M7.4 8.6l3 1.4M16.6 8.6l-3 1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><circle cx="9" cy="11" r="1.3" fill="currentColor"/><circle cx="15" cy="11" r="1.3" fill="currentColor"/><path d="M9 16q3-2.5 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    buried:   '<path d="M7 8.4l3.2 1.8M17 8.4l-3.2 1.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M7.6 11.4l2.8 2.8M10.4 11.4l-2.8 2.8M13.6 11.4l2.8 2.8M16.4 11.4l-2.8 2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M9 17.4q3-2.2 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  return `<svg class="icn mood-face" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${faces[mood] || faces.happy}</svg>`;
}

// ---- Stacklet, the character ----
// Returned as markup rather than a static file so the colours can key off
// the live CSS accent variables. Every animated part carries its own class
// (stk-*) because the state machine in popup.js animates them independently.
let stackletUid = 0;

// ---- Stacklet, the character ----
// Rebuilt from geometric primitives into an actual designed character.
// The differences that matter: a single continuous silhouette instead of
// stacked rectangles, radial shading for volume, a contact shadow so he
// reads as standing on something, and separated limb groups so animation
// can carry secondary motion (the antenna lags behind the body, arms
// overshoot at the end of a swing) rather than everything moving as one rigid
// block. That lag is what separates "animated" from "alive".
//
// mood: happy | neutral | stressed | buried
// accessory: null | hat | glasses | scarf | crown | backpack | stars | headphones | cape
function stackletSvg(mood = "happy", accessory = null) {
  const uid = ++stackletUid;
  const bodyGrad = `stkBody${uid}`;
  const shineGrad = `stkShine${uid}`;
  const glowGrad = `stkGlow${uid}`;

  // Cute proportions, deliberately. The previous build had a tall torso with
  // long limbs, which read as athletic rather than friendly. Cuteness in
  // character design comes from a specific set of ratios:
  //   - head/body as one large mass taking most of the height
  //   - eyes large, set WIDE apart and LOW on the face (high eyes read adult)
  //   - limbs short and stubby, never muscular
  //   - everything rounded, no hard corners or straight edges
  // Body now spans y18-52 of a 64 box, with eyes at y36 (well below centre)
  // and limbs reduced to small stubs.

  const eye = (cx) => `
    <g class="stk-eye">
      <ellipse cx="${cx}" cy="36" rx="5.2" ry="5.8" fill="var(--accent-ink)"/>
      <circle cx="${cx + 1.7}" cy="33.6" r="2" fill="#fff" opacity="0.95"/>
      <circle cx="${cx - 1.6}" cy="38.2" r="1" fill="#fff" opacity="0.5"/>
    </g>`;

  const shutEye = (cx) => `
    <path d="M${cx - 5} 35.4 Q${cx} 40 ${cx + 5} 35.4"
          stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;

  const mouths = {
    happy: `<path d="M27 45.5 Q32 50.5 37 45.5" stroke="var(--accent-ink)" stroke-width="2.5" stroke-linecap="round" fill="none"/>`,
    neutral: `<path d="M28.5 46.8 L35.5 46.8" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
    stressed: `<path d="M28 48 Q32 44.4 36 48" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
    buried: `<ellipse cx="32" cy="47.5" rx="3.4" ry="2.6" fill="var(--accent-ink)" opacity="0.85"/>`,
  };

  const brows = {
    happy: ``,
    neutral: ``,
    stressed: `<path d="M23.5 28.6 L29 26.6 M35 26.6 L40.5 28.6" stroke="var(--accent-ink)" stroke-width="1.8" stroke-linecap="round" opacity="0.5" fill="none"/>`,
    buried: `<path d="M23 29.4 L29.2 26.2 M34.8 26.2 L41 29.4" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round" opacity="0.7" fill="none"/>`,
  };

  const sweat = mood === "buried"
    ? `<path class="stk-sweat" d="M45.5 31 q2.3 3.6 2.3 5.2a2.3 2.3 0 01-4.6 0Q43.2 34.6 45.5 31z" fill="var(--chip-blue-ink)" opacity="0.6"/>`
    : "";

  // Blush stays on every mood. A stressed character with blush reads as
  // flustered and sympathetic; without it, just grumpy.
  const cheeks = `
    <ellipse cx="20.5" cy="43.5" rx="3.6" ry="2.3" fill="var(--chip-pink-ink)" opacity="${mood === "buried" ? 0.3 : 0.22}"/>
    <ellipse cx="43.5" cy="43.5" rx="3.6" ry="2.3" fill="var(--chip-pink-ink)" opacity="${mood === "buried" ? 0.3 : 0.22}"/>`;

  const accessories = {
    hat: `<g class="stk-acc"><ellipse cx="32" cy="16" rx="13" ry="3" fill="#241634"/>
          <path d="M25 15.6 V9.5 a7 2.6 0 0114 0 V15.6z" fill="#2e1c44"/>
          <ellipse cx="32" cy="9.5" rx="7" ry="2.4" fill="#3a2456"/>
          <path d="M25 14 h14" stroke="var(--accent-yellow)" stroke-width="1.8" opacity="0.85"/></g>`,
    glasses: `<g class="stk-acc"><circle cx="24" cy="36" r="7.4" fill="#a8d8ff" opacity="0.2" stroke="var(--accent-ink)" stroke-width="1.9"/>
          <circle cx="40" cy="36" r="7.4" fill="#a8d8ff" opacity="0.2" stroke="var(--accent-ink)" stroke-width="1.9"/>
          <path d="M31.4 35.4 q0.6-1 1.2 0" stroke="var(--accent-ink)" stroke-width="1.7" fill="none"/>
          <path d="M16.6 34.4 L13.8 32.4 M47.4 34.4 L50.2 32.4" stroke="var(--accent-ink)" stroke-width="1.7" stroke-linecap="round" fill="none"/></g>`,
    scarf: `<g class="stk-acc"><path d="M16 49.5 q16 6 32 0 v5 q-16 6-32 0z" fill="#d9455b"/>
          <path class="stk-scarf-tail" d="M38 53.5 q6 3 5 10 q-3.4 1.6-6-1 q-0.8-5 1-9z" fill="#c93c50"/></g>`,
    crown: `<g class="stk-acc"><path d="M21 17 L23 7 L27.5 12 L32 5 L36.5 12 L41 7 L43 17z" fill="#f2c230"/>
          <rect x="21" y="17" width="22" height="2.8" rx="1.2" fill="#dba81f"/>
          <circle cx="32" cy="10.5" r="1.8" fill="#e8556d"/></g>`,
    backpack: `<g class="stk-acc"><rect x="44" y="28" width="14" height="20" rx="5.5" fill="#4a9fd4"/>
          <rect x="46.5" y="32" width="9" height="7" rx="2.5" fill="#2f7fb0" opacity="0.6"/>
          <path d="M44 31 q-4-5-1-10" stroke="#4a9fd4" stroke-width="3.4" stroke-linecap="round" fill="none"/></g>`,
    stars: `<g class="stk-acc stk-stars">
          <path d="M8 22 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2-2.8 -2.8-1.2 2.8-1.2z" fill="#f7c948" opacity="0.85"/>
          <path d="M55 15 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1-2.2 -2.2-1 2.2-1z" fill="#f7c948" opacity="0.7"/>
          <circle cx="56" cy="42" r="1.6" fill="#f7c948" opacity="0.6"/>
          <circle cx="7" cy="44" r="1.3" fill="#f7c948" opacity="0.5"/></g>`,
    headphones: `<g class="stk-acc"><path d="M17 34 Q17 15 32 15 Q47 15 47 34" stroke="#2b2438" stroke-width="4.2" stroke-linecap="round" fill="none"/>
          <rect x="13" y="31" width="8.5" height="14" rx="4.25" fill="#2b2438"/>
          <rect x="42.5" y="31" width="8.5" height="14" rx="4.25" fill="#2b2438"/>
          <rect x="15.2" y="34" width="4" height="8" rx="2" fill="var(--accent-yellow)" opacity="0.7"/>
          <rect x="44.7" y="34" width="4" height="8" rx="2" fill="var(--accent-yellow)" opacity="0.7"/></g>`,
    cape: `<g class="stk-acc stk-cape"><path d="M17 30 Q9 50 18 60 Q32 52 46 60 Q55 50 47 30 Q32 38 17 30z" fill="#7b4fc9" opacity="0.9"/>
          <path d="M17 30 Q32 38 47 30" stroke="#5c37a0" stroke-width="1.4" fill="none" opacity="0.7"/></g>`,
  };

  return `
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <radialGradient id="${bodyGrad}" cx="38%" cy="26%" r="76%">
        <stop offset="0%"   stop-color="var(--accent-yellow-hover)"/>
        <stop offset="58%"  stop-color="var(--accent-yellow)"/>
        <stop offset="100%" stop-color="var(--accent-yellow)"/>
      </radialGradient>
      <radialGradient id="${shineGrad}" cx="50%" cy="30%" r="58%">
        <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${glowGrad}" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stop-color="var(--chip-purple-ink)" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="var(--chip-purple-ink)" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <ellipse class="stk-shadow" cx="32" cy="59.5" rx="13" ry="2.8" fill="var(--accent-ink)" opacity="0.15"/>

    <g class="stk-trail">
      <path d="M3 36 h8" stroke="var(--accent-yellow)" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
      <path d="M1 43 h6" stroke="var(--accent-yellow)" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>
    </g>

    <g class="stk-all">
      <!-- stubby feet, kept small so he never reads as long-legged -->
      <ellipse class="stk-foot-l" cx="25" cy="54.5" rx="5" ry="3.2" fill="var(--accent-ink)" opacity="0.85"/>
      <ellipse class="stk-foot-r" cx="39" cy="54.5" rx="5" ry="3.2" fill="var(--accent-ink)" opacity="0.85"/>

      <!-- little round arms -->
      <ellipse class="stk-arm-l" cx="14"  cy="41" rx="4.4" ry="6" fill="var(--accent-yellow)"/>
      <ellipse class="stk-arm-r" cx="50" cy="41" rx="4.4" ry="6" fill="var(--accent-yellow)"/>

      ${accessory === "cape" ? accessories.cape : ""}

      <g class="stk-body">
        <g class="stk-antenna">
          <path d="M34 20 Q36 14 39 12" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.5"/>
          <circle cx="39.5" cy="11" r="6" fill="url(#${glowGrad})"/>
          <circle class="stk-orb" cx="39.5" cy="11" r="3" fill="var(--chip-purple-bg)" stroke="var(--chip-purple-ink)" stroke-width="1.1"/>
          <circle cx="38.5" cy="10" r="1" fill="#fff" opacity="0.8"/>
        </g>

        <g class="stk-crest">
          <rect x="23" y="16" width="18" height="4" rx="2" fill="var(--chip-purple-bg)"/>
          <rect x="20.5" y="20" width="23" height="4" rx="2" fill="var(--chip-pink-bg)"/>
        </g>

        <!-- One big soft mass. Slightly wider than tall at the cheeks,
             tapering in toward a rounded base: the classic cute silhouette. -->
        <path d="M32 21
                 C44 21 50.5 28 50.5 37.5
                 C50.5 47.5 42.5 53 32 53
                 C21.5 53 13.5 47.5 13.5 37.5
                 C13.5 28 20 21 32 21z"
              fill="url(#${bodyGrad})"/>
        <ellipse cx="27" cy="31" rx="14" ry="11" fill="url(#${shineGrad})"/>

        <g class="stk-eyes-open">${eye(24)}${eye(40)}</g>
        <g class="stk-eyes-shut">${shutEye(24)}${shutEye(40)}</g>

        ${brows[mood] || ""}
        ${mouths[mood] || mouths.happy}
        ${cheeks}
        ${sweat}
      </g>

      ${accessory && accessory !== "cape" ? (accessories[accessory] || "") : ""}

      <g class="stk-zzz">
        <path class="stk-z1" d="M46 26 h5 l-5 6 h5" stroke="var(--secondaryLabel)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path class="stk-z2" d="M54 18 h4 l-4 4.5 h4" stroke="var(--secondaryLabel)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </g>

      <g class="stk-celebrate-fx">
        <path d="M9 26 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2-2.8 -2.8-1.2 2.8-1.2z" fill="var(--accent-yellow)"/>
        <path d="M53 29 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1-2.2 -2.2-1 2.2-1z" fill="var(--chip-pink-ink)"/>
        <path d="M32 6 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1-2.2 -2.2-1 2.2-1z" fill="var(--chip-purple-ink)"/>
      </g>
    </g>
  </svg>`;
}