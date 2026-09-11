// Shared between popup.js and sidepanel.js. Both surfaces show the same
// tab-group data and talk to the background worker the same way, so the
// glyph lookup, messaging helper, and HTML escaping used to be copy-pasted
// in both files. Load this before popup.js / sidepanel.js in their HTML.

const CATEGORY_GLYPHS = {
  "AI & ML": "✨",
  "Development": "</>",
  "Social & Media": "◎",
  "Productivity": "▤",
  "Communication": "◐",
  "Finance & Pay": "$",
  "Shopping": "▧",
  "Entertainment": "▶"
};

function glyphFor(name) {
  return CATEGORY_GLYPHS[name] || (name || "?").slice(0, 2).toUpperCase();
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

// ---- Stacklet, the character ----
// Returned as markup rather than a static file so the colours can key off
// the live CSS accent variables. Every animated part carries its own class
// (stk-*) because the state machine in popup.js animates them independently.
let stackletUid = 0;
function stackletSvg() {
  const gid = `stkGrad${++stackletUid}`;
  return `
  <svg viewBox="0 0 64 72" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="var(--accent-yellow)" />
        <stop offset="100%" stop-color="var(--accent-yellow-hover)" />
      </linearGradient>
    </defs>
    <g class="stk-all">
      <!-- speed trail, only visible in the working state -->
      <g class="stk-trail">
        <rect x="2"  y="34" width="9" height="2.5" rx="1.25" fill="var(--accent-yellow)" opacity="0.6" />
        <rect x="0"  y="42" width="6" height="2.5" rx="1.25" fill="var(--accent-yellow)" opacity="0.4" />
      </g>

      <!-- feet -->
      <ellipse class="stk-foot-l" cx="24" cy="64" rx="6"   ry="4" fill="var(--accent-ink)" opacity="0.85" />
      <ellipse class="stk-foot-r" cx="40" cy="64" rx="6"   ry="4" fill="var(--accent-ink)" opacity="0.85" />

      <!-- arms, behind the body so the shoulders read cleanly -->
      <rect class="stk-arm-l" x="6"  y="36" width="7" height="17" rx="3.5" fill="var(--accent-yellow)" />
      <rect class="stk-arm-r" x="51" y="36" width="7" height="17" rx="3.5" fill="var(--accent-yellow)" />

      <g class="stk-body">
        <!-- stacked-tab crest, tying him back to the product mark -->
        <rect x="20" y="2"  width="24" height="5" rx="2.5" fill="var(--chip-purple-bg)" />
        <rect x="17" y="8"  width="30" height="5" rx="2.5" fill="var(--chip-pink-bg)" />

        <!-- body -->
        <rect x="12" y="15" width="40" height="45" rx="15" fill="url(#${gid})" />

        <!-- open eyes -->
        <g class="stk-eye-open">
          <circle cx="25" cy="34" r="3.8" fill="var(--accent-ink)" />
          <circle cx="39" cy="34" r="3.8" fill="var(--accent-ink)" />
          <circle cx="26.3" cy="32.7" r="1.3" fill="#fff" opacity="0.9" />
          <circle cx="40.3" cy="32.7" r="1.3" fill="#fff" opacity="0.9" />
        </g>
        <!-- shut eyes, swapped in while sleeping -->
        <g class="stk-eye-shut">
          <path d="M21 34 Q25 37.5 29 34" stroke="var(--accent-ink)" stroke-width="2.2" stroke-linecap="round" fill="none" />
          <path d="M35 34 Q39 37.5 43 34" stroke="var(--accent-ink)" stroke-width="2.2" stroke-linecap="round" fill="none" />
        </g>

        <!-- smile -->
        <path d="M27 44 Q32 48.5 37 44" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.8" />

        <!-- cheeks -->
        <ellipse cx="19.5" cy="41" rx="3" ry="2" fill="var(--chip-pink-ink)" opacity="0.2" />
        <ellipse cx="44.5" cy="41" rx="3" ry="2" fill="var(--chip-pink-ink)" opacity="0.2" />
      </g>

      <!-- antenna spark -->
      <path class="stk-spark" d="M52 6 l2 4.2 4.2 2 -4.2 2 -2 4.2 -2 -4.2 -4.2 -2 4.2 -2 z" fill="var(--chip-purple-ink)" opacity="0.6" />

      <!-- Zzz, only visible while asleep -->
      <g class="stk-zzz">
        <text x="47" y="18" font-size="11" font-weight="800" fill="var(--secondaryLabel)">z</text>
        <text x="54" y="11" font-size="8"  font-weight="800" fill="var(--secondaryLabel)">z</text>
      </g>
    </g>
  </svg>`;
}