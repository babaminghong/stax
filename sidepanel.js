// sidepanel.js: Live tab group navigator with Stacklet walking along the bottom.
// Shared helpers (stackletSvg, glyphFor, escapeHtml, sendMessage,
// applyAccent, ACCENT_PRESETS) come from shared.js, loaded first.

(async function applyThemeEarly() {
  const { theme = "auto", accent = "sunrise" } = await chrome.storage.sync.get(["theme", "accent"]);
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  applyAccent(accent);
})();

// ---- Stacklet in the side panel ----
const SLEEP_AFTER_MS_SP = 40000;
let spX = 0;
let spFigure = null;
let spBubble = null;
let spStage = null;
let spSleepTimer = null;
let spMood = "happy";

function spTravelLimit() {
  if (!spStage || !spFigure) return 0;
  return Math.max(0, spStage.clientWidth - spFigure.offsetWidth - 2);
}

function setSpState(state) {
  if (!spFigure) return;
  spFigure.classList.remove("idle","sleeping","waking","walking","working","celebrate");
  spFigure.classList.add(state);
}

function spRegisterSleep() {
  clearTimeout(spSleepTimer);
  setSpState("idle");
  spSleepTimer = setTimeout(() => setSpState("sleeping"), SLEEP_AFTER_MS_SP);
}

function spWake() {
  clearTimeout(spSleepTimer);
  setSpState("waking");
  setTimeout(spRegisterSleep, 560);
}

function spDropFootprint(x) {
  if (!spStage) return;
  const prints = spStage.querySelectorAll(".stk-footprint");
  if (prints.length >= 3) prints[0].remove();
  const p = document.createElement("div");
  p.className = "stk-footprint";
  p.style.left = `${Math.max(0, x + 10)}px`;
  spStage.appendChild(p);
  setTimeout(() => p.remove(), 1600);
}

// Bubble is nested inside the figure, so it travels with him. Only the
// edge-anchoring side needs deciding.
function spPositionBubble() {
  if (!spBubble || !spStage || !spFigure) return;
  const half = spBubble.offsetWidth / 2;
  const centre = spX + spFigure.offsetWidth / 2;
  spFigure.classList.remove("bubble-left", "bubble-right");
  if (centre - half < 2) spFigure.classList.add("bubble-right");
  else if (centre + half > spStage.clientWidth - 2) spFigure.classList.add("bubble-left");
}

function spSay(text, holdMs = 3000) {
  if (!spBubble) return;
  if (spFigure?.classList.contains("sleeping")) spWake();
  spPositionBubble();
  spBubble.textContent = text;
  spBubble.classList.add("show");
  clearTimeout(spSay._t);
  spSay._t = setTimeout(() => spBubble.classList.remove("show"), holdMs);
}

function spMoveTo(target, { dash = false } = {}) {
  if (!spFigure) return;
  const limit = spTravelLimit();
  const clamped = Math.max(0, Math.min(target, limit));
  if (Math.abs(clamped - spX) < 16) return;
  const duration = dash ? 280 : 860;
  spFigure.classList.toggle("flipped", clamped < spX);
  setSpState(dash ? "working" : "walking");
  spFigure.classList.toggle("dash", dash);
  // Drop 2-3 footprints spaced across the move
  const steps = dash ? 2 : 3;
  for (let i = 1; i <= steps; i++) {
    setTimeout(() => spDropFootprint(spX + ((clamped - spX) * i) / steps), (duration / steps) * i * 0.8);
  }
  spX = clamped;
  spFigure.style.transform = `translateX(${spX}px)`;
  spPositionBubble();
  setTimeout(() => { spFigure.classList.remove("dash"); spRegisterSleep(); }, duration);
}

async function syncSpMood() {
  try {
    const win = await chrome.windows.getCurrent();
    const res = await sendMessage({ type: "GET_HYGIENE", windowId: win.id });
    if (!res?.ok || res.mood === spMood) return;
    spMood = res.mood;
    const accRes = await sendMessage({ type: "GET_ACCESSORIES" });
    const equipped = accRes?.equipped || null;
    if (spFigure) spFigure.innerHTML = stackletSvg(spMood, equipped);
  } catch { /* side panel can outlive extension reloads */ }
}

function initSpStacklet() {
  spFigure = document.getElementById("spFigure");
  spBubble = document.getElementById("spBubble");
  spStage  = document.getElementById("spStage");
  if (!spFigure) return;

  spFigure.innerHTML = stackletSvg(spMood, null);
  spRegisterSleep();

  spFigure.addEventListener("click", () => {
    if (spFigure.classList.contains("sleeping")) {
      spWake();
      spSay("I'm up!");
    } else {
      spMoveTo(Math.random() * spTravelLimit());
    }
  });

  // Occasional idle stroll
  setInterval(() => {
    if (!spFigure.classList.contains("sleeping") && Math.random() < 0.35) {
      spMoveTo(Math.random() * spTravelLimit());
    }
  }, 11000);

  syncSpMood();
  setInterval(syncSpMood, 30000);
}

// ---- Status banner ----
function showStatus(text, kind = "info") {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;
  banner.textContent = text;
  banner.className = `status-banner show ${kind}`;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => banner.classList.remove("show"), 4000);
}

// ---- Group tree ----
let renameInProgress = false;

async function getActiveWindowId() {
  const win = await chrome.windows.getCurrent();
  return win.id;
}

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
      <div style="display:flex; align-items:center; min-width:0; flex:1;">
        <span class="group-badge group-badge-${g.color}">${glyphFor(g.title)}</span>
        <span class="group-name" data-group-id="${g.id}">${escapeHtml(g.title || "Unnamed Group")}</span>
        <span class="group-count">${tabsInGroup.length}</span>
      </div>
      <div class="group-actions">
        <button class="btn-icon-small group-up"       title="Move left"  data-group-id="${g.id}">&#8249;</button>
        <button class="btn-icon-small group-down"     title="Move right" data-group-id="${g.id}">&#8250;</button>
        <button class="btn-icon-small group-collapse" title="${g.collapsed ? "Expand" : "Collapse"}" data-group-id="${g.id}">${g.collapsed ? "\u02c5" : "\u02c4"}</button>
        <button class="btn-icon-small group-rename"   title="Rename" data-group-id="${g.id}">&#9998;</button>
        <button class="btn-icon-small group-closeall" title="Close all tabs in this group" data-group-id="${g.id}">${icon("moon", 12)}</button>
        <button class="btn-icon-small group-ungroup"  title="Ungroup" data-group-id="${g.id}">${icon("close", 12)}</button>
      </div>
    `;

    item.querySelector(".group-collapse").addEventListener("click", async (e) => {
      await sendMessage({ type: "TOGGLE_GROUP_COLLAPSE", groupId: Number(e.currentTarget.dataset.groupId) });
      loadTree();
    });
    item.querySelector(".group-rename").addEventListener("click", (e) => {
      startRename(item, Number(e.currentTarget.dataset.groupId), g.title || "");
    });
    item.querySelector(".group-ungroup").addEventListener("click", async (e) => {
      await sendMessage({ type: "UNGROUP_ONE", groupId: Number(e.currentTarget.dataset.groupId) });
      loadTree();
    });

    item.querySelector(".group-up").addEventListener("click", async (e) => {
      const res = await sendMessage({ type: "MOVE_GROUP_BY", groupId: Number(e.currentTarget.dataset.groupId), direction: -1 });
      if (!res?.ok && res?.error === "at-edge") showStatus("Already first.", "info");
      loadTree();
    });
    item.querySelector(".group-down").addEventListener("click", async (e) => {
      const res = await sendMessage({ type: "MOVE_GROUP_BY", groupId: Number(e.currentTarget.dataset.groupId), direction: 1 });
      if (!res?.ok && res?.error === "at-edge") showStatus("Already last.", "info");
      loadTree();
    });

    // Closing a whole group is the most destructive click here, so it
    // requires a second press within three seconds rather than a dialog.
    const closeBtn = item.querySelector(".group-closeall");
    let armed = false;
    closeBtn.addEventListener("click", async (e) => {
      const groupId = Number(e.currentTarget.dataset.groupId);
      if (!armed) {
        armed = true;
        closeBtn.classList.add("armed");
        closeBtn.title = "Click again to close all tabs";
        showStatus(`Click again to close "${g.title || "group"}" (${tabsInGroup.length} tabs).`, "error");
        setTimeout(() => { armed = false; closeBtn.classList.remove("armed"); }, 3000);
        return;
      }
      const res = await sendMessage({ type: "CLOSE_GROUP_TABS", groupId });
      showStatus(res?.ok ? `Closed ${res.closed} tab(s). Undo available.` : "Couldn't close that group.", res?.ok ? "ok" : "error");
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
  input.focus(); input.select();
  let settled = false;
  async function commit() {
    if (settled) return; settled = true;
    const newTitle = input.value.trim();
    renameInProgress = false;
    if (newTitle && newTitle !== currentTitle) await sendMessage({ type: "RENAME_GROUP", groupId, title: newTitle });
    loadTree();
  }
  function cancel() { if (settled) return; settled = true; renameInProgress = false; loadTree(); }
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); if (e.key === "Escape") cancel(); });
}

// ---- Button wiring ----
document.getElementById("spQuickSort")?.addEventListener("click", async () => {
  const windowId = await getActiveWindowId();
  const btn = document.getElementById("spQuickSort");
  btn.disabled = true;
  spMoveTo(spTravelLimit(), { dash: true });
  spSay("On it!", 1400);
  const res = await sendMessage({ type: "SMART_SORT", windowId });
  btn.disabled = false;
  if (res?.ok) {
    const suffix = res.aiUsed ? " (AI)" : "";
    showStatus(`${res.groupsCreated} group(s) created${suffix}.`, "ok");
    spMoveTo(0);
    spSay(res.groupsCreated > 0 ? "All sorted!" : "Already tidy.", 2400);
  } else {
    showStatus("Sort failed. Try again.", "error");
  }
  loadTree();
  syncSpMood();
});

document.getElementById("spUngroupAll")?.addEventListener("click", async () => {
  const windowId = await getActiveWindowId();
  await sendMessage({ type: "UNGROUP_ALL", windowId });
  loadTree();
  spSay("Ungrouped everything.");
});

document.getElementById("spFocus")?.addEventListener("click", async () => {
  const windowId = await getActiveWindowId();
  const btn = document.getElementById("spFocus");
  const state = await sendMessage({ type: "GET_FOCUS_STATE" });
  if (state?.active) {
    await sendMessage({ type: "EXIT_FOCUS", windowId });
    btn.textContent = "Focus Mode";
    btn.classList.replace("btn-primary", "btn-secondary");
    spSay("Focus mode off.");
  } else {
    const res = await sendMessage({ type: "ENTER_FOCUS", windowId });
    if (res?.ok) {
      btn.textContent = "Exit Focus";
      btn.classList.replace("btn-secondary", "btn-primary");
      spSay("Focus mode on.");
    }
  }
});

// Keep the panel in sync as tabs/groups change.
chrome.tabGroups.onCreated.addListener(loadTree);
chrome.tabGroups.onRemoved.addListener(loadTree);
chrome.tabGroups.onUpdated.addListener(loadTree);
chrome.tabs.onRemoved.addListener(loadTree);

document.addEventListener("DOMContentLoaded", () => {
  localizeDom();
  document.querySelectorAll("[data-icon]").forEach(el => {
    const size = Number(el.dataset.iconSize) || 16;
    el.innerHTML = icon(el.dataset.icon, size);
  });
  initSpStacklet();
  loadTree();
});