// CATEGORY_GLYPHS, glyphFor, sendMessage, escapeHtml, and the early theme
// application (kept in sync with whatever was chosen in the popup's
// Preferences card) all live in shared.js now — sidepanel.html loads it first.

function showStatus(text, kind = "info") {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;
  banner.textContent = text;
  banner.className = `status-banner show ${kind}`;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => banner.classList.remove("show"), 4000);
}

async function getActiveWindowId() {
  const win = await chrome.windows.getCurrent();
  return win.id;
}

// True while a rename input is focused, so a background tabGroups event
// (another window's group changing, etc.) doesn't blow away an in-progress
// edit by re-rendering the whole tree out from under it.
let renameInProgress = false;

async function loadTree() {
  const treeView = document.getElementById("treeView");
  if (!treeView || renameInProgress) return;

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
      <div style="display:flex; align-items:center; min-width: 0; flex: 1;">
        <span class="group-badge group-badge-${g.color}">${glyphFor(g.title)}</span>
        <span class="group-name" data-group-id="${g.id}">${escapeHtml(g.title || "Unnamed Group")}</span>
        <span class="group-count">${tabsInGroup.length}</span>
      </div>
      <div class="group-actions">
        <button class="btn-icon-small group-collapse" title="${g.collapsed ? "Expand" : "Collapse"}" data-group-id="${g.id}">${g.collapsed ? "⌄" : "⌃"}</button>
        <button class="btn-icon-small group-rename" title="Rename" data-group-id="${g.id}">✎</button>
        <button class="btn-icon-small group-move" title="Move to new window" data-group-id="${g.id}">⇱</button>
        <button class="btn-icon-small group-ungroup" title="Ungroup" data-group-id="${g.id}">✕</button>
      </div>
    `;

    item.querySelector(".group-collapse").addEventListener("click", async (e) => {
      const groupId = Number(e.currentTarget.dataset.groupId);
      await sendMessage({ type: "TOGGLE_GROUP_COLLAPSE", groupId });
      loadTree();
    });

    item.querySelector(".group-rename").addEventListener("click", (e) => {
      startRename(item, Number(e.currentTarget.dataset.groupId), g.title || "");
    });

    item.querySelector(".group-move").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const groupId = Number(btn.dataset.groupId);
      const res = await sendMessage({ type: "MOVE_GROUP_TO_NEW_WINDOW", groupId });
      showStatus(res?.ok ? "Moved to a new window." : "Couldn't move that group.", res?.ok ? "ok" : "error");
      loadTree();
    });

    item.querySelector(".group-ungroup").addEventListener("click", async (e) => {
      const groupId = Number(e.currentTarget.dataset.groupId);
      await sendMessage({ type: "UNGROUP_ONE", groupId });
      loadTree();
    });

    treeView.appendChild(item);
  }
}

function startRename(item, groupId, currentTitle) {
  const nameSpan = item.querySelector(".group-name");
  if (!nameSpan) return;
  renameInProgress = true;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "group-name-input";
  input.value = currentTitle;
  input.maxLength = 40;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  async function commit() {
    if (settled) return;
    settled = true;
    const newTitle = input.value.trim();
    renameInProgress = false;
    if (newTitle && newTitle !== currentTitle) {
      await sendMessage({ type: "RENAME_GROUP", groupId, title: newTitle });
    }
    loadTree();
  }
  function cancel() {
    if (settled) return;
    settled = true;
    renameInProgress = false;
    loadTree();
  }

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur(); // triggers commit via blur
    if (e.key === "Escape") cancel();
  });
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