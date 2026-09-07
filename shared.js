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

// Applied as early as possible (before anything paints) to avoid a
// light-then-dark flash when the saved theme differs from the OS setting.
// Same stored value in both popup and side panel, so they always match.
(async function applyThemeEarly() {
  const { theme = "auto" } = await chrome.storage.sync.get(["theme"]);
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
})();