const groupsEl = document.getElementById("groups");
const countLine = document.getElementById("countLine");
const statusEl = document.getElementById("status");
const aiBtn = document.getElementById("aiSortBtn");
const localBtn = document.getElementById("localSortBtn");
const autoToggle = document.getElementById("autoToggle");

let windowId = null;

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

async function render() {
  const win = await chrome.windows.getCurrent();
  windowId = win.id;

  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }),
  ]);

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const byGroup = new Map(); // key: group name or "__ungrouped__"

  for (const t of tabs) {
    if (t.pinned || !t.url) continue;
    const g = groupById.get(t.groupId);
    const key = g ? g.title || "Untitled" : "__ungrouped__";
    if (!byGroup.has(key)) byGroup.set(key, { color: g ? g.color : "grey", tabs: [] });
    byGroup.get(key).tabs.push(t);
  }

  const groupNames = [...byGroup.keys()].filter((k) => k !== "__ungrouped__");
  countLine.textContent = `${tabs.length} tabs · ${groupNames.length} groups`;

  groupsEl.innerHTML = "";
  for (const [name, { color, tabs: groupTabs }] of byGroup) {
    const section = document.createElement("section");
    section.className = "group";
    section.dataset.color = color;

    const head = document.createElement("div");
    head.className = "group-head";
    head.innerHTML = `<span>${name === "__ungrouped__" ? "Ungrouped" : escapeHtml(name)}</span><span class="n">${groupTabs.length}</span>`;
    section.appendChild(head);

    for (const t of groupTabs) {
      const row = document.createElement("div");
      row.className = "tab-row";
      row.innerHTML = `
        <span class="title" title="${escapeHtml(t.title || "")}">${escapeHtml(t.title || "(untitled)")}</span>
        <span class="host">${escapeHtml(hostnameOf(t.url))}</span>
      `;
      const select = document.createElement("select");
      select.style.cssText = "background:#1b1f2e;color:#8b90a6;border:1px solid #333a54;border-radius:6px;font-size:11px;padding:2px 4px;";
      select.appendChild(new Option("Move…", "", true, true));
      for (const gn of groupNames) select.appendChild(new Option(gn, gn));
      select.appendChild(new Option("Ungroup", "__ungroup__"));
      select.addEventListener("change", async () => {
        if (!select.value) return;
        await chrome.runtime.sendMessage({ type: "MOVE_TAB", tabId: t.id, groupName: select.value, windowId });
        render();
      });
      row.appendChild(select);
      section.appendChild(row);
    }
    groupsEl.appendChild(section);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function flashSorted() {
  document.querySelectorAll(".group").forEach((el) => {
    el.classList.remove("just-sorted");
    void el.offsetWidth; // restart animation
    el.classList.add("just-sorted");
  });
}

aiBtn.addEventListener("click", async () => {
  aiBtn.disabled = true;
  setStatus("Asking the model to sort your tabs…");
  const res = await chrome.runtime.sendMessage({ type: "AI_SORT", windowId });
  aiBtn.disabled = false;
  if (res?.ok) {
    setStatus(`Sorted ${res.count} tabs.`, "success");
    await render();
    flashSorted();
  } else {
    setStatus(res?.error || "Something went wrong.", "error");
  }
});

localBtn.addEventListener("click", async () => {
  localBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: "LOCAL_SORT", windowId });
  localBtn.disabled = false;
  setStatus("Quick-sorted by domain.", "success");
  await render();
  flashSorted();
});

autoToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ autoSortEnabled: autoToggle.checked });
});

(async function init() {
  const { autoSortEnabled } = await chrome.storage.local.get("autoSortEnabled");
  autoToggle.checked = autoSortEnabled !== false; // default on
  await render();
})();
