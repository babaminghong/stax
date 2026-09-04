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

// Keep the side panel's theme in sync with whatever was chosen in the
// popup's Preferences card — same stored value, same attribute mechanism.
(async function applyThemeEarly() {
  const { theme = "auto" } = await chrome.storage.sync.get(["theme"]);
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
})();

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(res));
  });
}

function showStatus(text, kind = "info") {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;
  banner.textContent = text;
  banner.className = `status-banner show ${kind}`;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => banner.classList.remove("show"), 4000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function getActiveWindowId() {
  const win = await chrome.windows.getCurrent();
  return win.id;
}

async function loadTree() {
  const treeView = document.getElementById("treeView");
  if (!treeView) return;

  const windowId = await getActiveWindowId();
  const groups = await chrome.tabGroups.query({ windowId });

  if (!groups.length) {
    treeView.innerHTML = `<div class="empty-state">No active groups in this window</div>`;
    return;
  }

  treeView.innerHTML = "";
  for (const g of groups) {
    const tabsInGroup = await chrome.tabs.query({ groupId: g.id });
    const item = document.createElement("div");
    item.className = "group-item";
    item.innerHTML = `
      <div style="display:flex; align-items:center;">
        <span class="group-badge group-badge-${g.color}">${glyphFor(g.title)}</span>
        <span class="group-name">${escapeHtml(g.title || "Unnamed Group")}</span>
        <span class="group-count">${tabsInGroup.length}</span>
      </div>
      <button class="btn-icon-small" title="Ungroup" data-group-id="${g.id}">✕</button>
    `;
    item.querySelector("button").addEventListener("click", async (e) => {
      const groupId = Number(e.currentTarget.dataset.groupId);
      await sendMessage({ type: "UNGROUP_ONE", groupId });
      loadTree();
    });
    treeView.appendChild(item);
  }
}

document.getElementById("spQuickSort")?.addEventListener("click", async () => {
  const windowId = await getActiveWindowId();
  const res = await sendMessage({ type: "SMART_SORT", windowId });
  if (res?.ok) {
    const suffix = res.aiUsed ? " (AI covered the rest)" : "";
    showStatus(`Created ${res.groupsCreated} group(s)${suffix}.`, "ok");
  } else {
    showStatus("Sort failed — try again.", "error");
  }
  loadTree();
});

document.getElementById("spUngroupAll")?.addEventListener("click", async () => {
  const windowId = await getActiveWindowId();
  await sendMessage({ type: "UNGROUP_ALL", windowId });
  loadTree();
});

// Keep the panel in sync as tabs/groups change in the background.
chrome.tabGroups.onCreated.addListener(loadTree);
chrome.tabGroups.onRemoved.addListener(loadTree);
chrome.tabGroups.onUpdated.addListener(loadTree);
chrome.tabs.onRemoved.addListener(loadTree);

document.addEventListener("DOMContentLoaded", loadTree);