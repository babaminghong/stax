// CATEGORY_GLYPHS, glyphFor, sendMessage, escapeHtml, and the early theme
// application all live in shared.js now, popup.html loads it first.

function friendlyAiError(rawError) {
  const msg = rawError || "AI grouping failed.";
  if (/\b503\b/.test(msg) || /UNAVAILABLE/i.test(msg)) {
    return "The AI model is overloaded right now, already retried a few times. Try again shortly.";
  }
  if (/\b529\b/.test(msg) || /overloaded/i.test(msg)) {
    return "Claude is overloaded right now, already retried a few times. Try again shortly.";
  }
  if (/\b401\b/.test(msg) || /\b403\b/.test(msg)) {
    return "That API key was rejected, check it in Settings.";
  }
  if (/\b429\b/.test(msg)) {
    return "Rate limited, you've hit the request cap for now. Try again in a bit.";
  }
  return msg;
}

document.addEventListener("DOMContentLoaded", async () => {
  hydrateIcons();
  localizeDom();
  const versionBadge = document.getElementById("versionBadge");
  if (versionBadge) versionBadge.textContent = `v${chrome.runtime.getManifest().version}`;

  const { onboarded, autoSortOnNewTab, theme = "auto" } =
    await chrome.storage.sync.get(["onboarded", "autoSortOnNewTab", "theme"]);
  const splashScreen = document.getElementById("splashScreen");
  const onboardScreen = document.getElementById("onboardingScreen");
  const mainScreen = document.getElementById("mainScreen");
  const settingsScreen = document.getElementById("settingsScreen");

  if (!onboarded) {
    // First-run only. The splash used to hard-cut to the wizard the instant
    // the tagline landed, which read as a glitch. Now the splash fades out
    // while the wizard fades in underneath it, with the two overlapping.
    mainScreen.style.display = "none";
    settingsScreen.style.display = "none";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onboardScreen.style.display = "block";
      initOnboardingWizard(onboardScreen, mainScreen, settingsScreen);
    } else {
      splashScreen.style.display = "flex";

      // The wizard is mounted (but transparent) from the very first frame.
      // The splash is an overlay now, so it contributes no height of its
      // own; if the wizard were display:none the popup would collapse to a
      // thin strip behind it. Rendering it underneath from the start also
      // means the cross-fade has nothing left to lay out when it runs.
      onboardScreen.style.display = "block";
      onboardScreen.style.opacity = "0";
      onboardScreen.style.transform = "translateY(12px)";
      onboardScreen.style.pointerEvents = "none";
      initOnboardingWizard(onboardScreen, mainScreen, settingsScreen);

      // Let the tagline sit for a beat before anything starts moving.
      setTimeout(() => {
        splashScreen.style.transition = "opacity 0.45s var(--ease-out), transform 0.45s var(--ease-out)";
        splashScreen.style.opacity = "0";
        splashScreen.style.transform = "translateY(-10px) scale(0.97)";

        onboardScreen.style.transition = "opacity 0.5s var(--ease-out), transform 0.55s var(--ease-out)";
        onboardScreen.style.opacity = "1";
        onboardScreen.style.transform = "translateY(0)";
        onboardScreen.style.pointerEvents = "";

        setTimeout(() => { splashScreen.style.display = "none"; }, 500);
      }, 2150);
    }
  } else {
    splashScreen.style.display = "none";
    onboardScreen.style.display = "none";
    settingsScreen.style.display = "none";
    mainScreen.style.display = "block";
    loadActiveGroups();
  }

  const autoSortToggle = document.getElementById("autoSortToggle");
  if (autoSortToggle) {
    autoSortToggle.checked = !!autoSortOnNewTab;
    autoSortToggle.addEventListener("change", async () => {
      await chrome.storage.sync.set({ autoSortOnNewTab: autoSortToggle.checked });
    });
  }

  // Accent picker, swatches are painted from ACCENT_PRESETS (shared.js),
  // and choosing one just flips the data-accent attribute the CSS keys off.
  const accentGrid = document.getElementById("accentGrid");
  if (accentGrid) {
    const { accent = "sunrise" } = await chrome.storage.sync.get(["accent"]);
    ACCENT_PRESETS.forEach(preset => {
      const btn = document.createElement("button");
      btn.className = `swatch${preset.id === accent ? " active" : ""}`;
      btn.style.background = preset.swatch;
      btn.title = preset.label;
      btn.dataset.accent = preset.id;
      btn.addEventListener("click", async () => {
        accentGrid.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
        btn.classList.add("active");
        await chrome.storage.sync.set({ accent: preset.id });
        applyAccent(preset.id);
      });
      accentGrid.appendChild(btn);
    });
  }

  // Stacklet preferences. The auto-run warning is shown whenever the toggle
  // is on, including on open, not just when it's flipped, so someone who
  // switched it on a week ago still sees what it means.
  const { stackletProfile = "general", stackletAutoRun = false } =
    await chrome.storage.sync.get(["stackletProfile", "stackletAutoRun"]);

  const profileSelect = document.getElementById("stackletProfile");
  if (profileSelect) {
    profileSelect.value = stackletProfile;
    profileSelect.addEventListener("change", async () => {
      await chrome.storage.sync.set({ stackletProfile: profileSelect.value });
    });
  }

  const autoRunToggle = document.getElementById("autoRunToggle");
  const autoRunNote = document.getElementById("autoRunNote");
  if (autoRunToggle) {
    autoRunToggle.checked = !!stackletAutoRun;
    if (autoRunNote) autoRunNote.style.display = stackletAutoRun ? "block" : "none";
    autoRunToggle.addEventListener("change", async () => {
      await chrome.storage.sync.set({ stackletAutoRun: autoRunToggle.checked });
      if (autoRunNote) autoRunNote.style.display = autoRunToggle.checked ? "block" : "none";
    });
  }

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    const buttons = themeToggle.querySelectorAll(".toggle-btn");
    buttons.forEach(btn => btn.classList.toggle("active", btn.dataset.value === theme));
    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const value = btn.dataset.value;
        await chrome.storage.sync.set({ theme: value });
        if (value === "auto") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", value);
      });
    });
  }

  // Settings now lives entirely inside the popup, no separate window/tab.
  document.getElementById("openSettings")?.addEventListener("click", () => {
    mainScreen.style.display = "none";
    settingsScreen.style.display = "block";
    initSettingsScreen();
    loadSuggestedRules();
  });
  document.getElementById("settingsBack")?.addEventListener("click", () => {
    settingsScreen.style.display = "none";
    mainScreen.style.display = "block";
  });

  document.getElementById("quickSort")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    await withCurrentWindow(async (windowId) => {
      // Smart Sort = local rules first, then AI silently mops up whatever
      // the rules couldn't place (only if a key is configured).
      const res = await sendMessage({ type: "SMART_SORT", windowId });
      if (res?.ok) {
        const suffix = res.aiUsed ? " (AI covered the rest)" : "";
        showStatus(t("sortedGroups", res.groupsCreated) + suffix, "ok");
        if (res.groupsCreated > 0) {
          showUndoBanner("Sort made some changes.");
          earn("sort");
          [document.getElementById("stackletFigure"), document.getElementById("perchedStacklet")]
            .forEach(el => { if (el) celebrateStacklet(el); });
          stackletReact(`Sorted into ${res.groupsCreated} group${res.groupsCreated === 1 ? "" : "s"}!`);
        }
      } else {
        showStatus(t("sortFailed"), "error");
      }
      loadActiveGroups();
      syncStackletMood();
    });
    btn.disabled = false;
  });

  document.getElementById("aiSort")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="ai-spark">${icon("sparkle", 14)}</span>&nbsp;Thinking\u2026`;
    await withCurrentWindow(async (windowId) => {
      const res = await sendMessage({ type: "AI_SORT", windowId });
      if (!res) {
        showStatus("No response from background worker.", "error");
      } else if (res.ok) {
        showStatus(`AI created ${res.groupsCreated} group(s).`, "ok");
        if (res.groupsCreated > 0) earn("ai_sort");
        if (res.groupsCreated > 0) showUndoBanner("AI sort made some changes.");
      } else if (res.error === "no-key") {
        showStatus(t("noApiKey"), "error");
      } else {
        showStatus(friendlyAiError(res.error), "error");
      }
      loadActiveGroups();
    });
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  });

  document.getElementById("ungroupAll")?.addEventListener("click", async () => {
    await withCurrentWindow(async (windowId) => {
      await sendMessage({ type: "UNGROUP_ALL", windowId });
      loadActiveGroups();
    });
  });

  document.getElementById("dedupe")?.addEventListener("click", async () => {
    const res = await sendMessage({ type: "REMOVE_DUPLICATES" });
    if (res?.ok) {
      showStatus(`Closed ${res.removed} duplicate tab(s).`, "ok");
      if (res.removed > 0) {
        showUndoBanner("Closed some duplicate tabs.");
        earn("dedupe");
        stackletReact(`Cleared ${res.removed} duplicate${res.removed === 1 ? "" : "s"}.`);
      }
    }
    loadActiveGroups();
    syncStackletMood();
  });

  document.getElementById("createGroupBtn")?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
      await chrome.tabGroups.update(groupId, { title: "Custom Group", color: "blue" });
      loadActiveGroups();
    }
  });

  document.getElementById("undoBtn")?.addEventListener("click", async () => {
    hideUndoBanner();
    const res = await sendMessage({ type: "UNDO_LAST_ACTION" });
    if (res?.ok) {
      showStatus(res.type === "dedupe" ? "Duplicate tabs reopened." : "Sort undone.", "ok");
    } else {
      showStatus(t("nothingToUndo"), "error");
    }
    loadActiveGroups();
  });

  document.getElementById("suspendInactive")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    await withCurrentWindow(async (windowId) => {
      const res = await sendMessage({ type: "SUSPEND_INACTIVE", windowId });
      if (res?.ok) {
        showStatus(res.suspended > 0 ? `Suspended ${res.suspended} inactive tab(s).` : "No inactive tabs to suspend right now.", "ok");
        if (res.suspended > 0) earn("suspend");
      } else {
        showStatus("Couldn't suspend tabs, try again.", "error");
      }
    });
    btn.disabled = false;
  });

  // ---- Saved sessions ----
  const sessionSaveRow = document.getElementById("sessionSaveRow");
  const sessionNameInput = document.getElementById("sessionNameInput");

  document.getElementById("saveSessionBtn")?.addEventListener("click", () => {
    const showing = sessionSaveRow.style.display === "flex";
    sessionSaveRow.style.display = showing ? "none" : "flex";
    if (!showing) sessionNameInput.focus();
  });

  sessionNameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("sessionSaveConfirm").click();
  });

  document.getElementById("sessionSaveConfirm")?.addEventListener("click", async () => {
    const name = sessionNameInput.value.trim();
    await withCurrentWindow(async (windowId) => {
      const res = await sendMessage({ type: "SAVE_SESSION", windowId, name });
      if (res?.ok) {
        showStatus(`Saved "${res.session.name}" (${res.session.tabCount} tabs).`, "ok");
        earn("session_save");
        sessionNameInput.value = "";
        sessionSaveRow.style.display = "none";
        loadSessions();
      } else if (res?.error === "no-tabs") {
        showStatus("No tabs to save in this window.", "error");
      } else {
        showStatus("Couldn't save the session, try again.", "error");
      }
    });
  });

  loadSessions();
  // loadRecentlyClosed and loadArchive are now lazy — they run when the
  // user opens the inbox accordion, so we only hit the API when needed.
  syncStackletMood();
  document.getElementById("archiveCurrentBtn")?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const res = await sendMessage({ type: "ARCHIVE_TABS", tabIds: [tab.id] });
    if (res?.ok) {
      showStatus("Saved to Read Later.", "ok");
      window.close();
    } else {
      showStatus("Can't archive that tab.", "error");
    }
  });

  // ---- Focus mode ----
  let focusActive = false;
  async function syncFocusBtn() {
    const res = await sendMessage({ type: "GET_FOCUS_STATE" });
    focusActive = !!res?.active;
    const tile = document.getElementById("focusBtn");
    if (tile) tile.classList.toggle("active", focusActive);
  }
  document.getElementById("focusBtn")?.addEventListener("click", async () => {
    await withCurrentWindow(async (windowId) => {
      if (focusActive) {
        const res = await sendMessage({ type: "EXIT_FOCUS", windowId });
        showStatus(res?.ok ? "Focus mode off." : "Nothing to exit.", res?.ok ? "ok" : "error");
      } else {
        const res = await sendMessage({ type: "ENTER_FOCUS", windowId, suspendOthers: false });
        showStatus(res?.ok ? `Collapsed ${res.collapsed} group(s). You're in focus.` : "Focus failed.", res?.ok ? "ok" : "error");
        if (res?.ok) earn("focus");
      }
    });
    syncFocusBtn();
    loadActiveGroups();
  });

  // ---- Archive stale tabs ----
  document.getElementById("archiveStaleBtn")?.addEventListener("click", async () => {
    await withCurrentWindow(async (windowId) => {
      const res = await sendMessage({ type: "ARCHIVE_STALE", windowId, days: 7 });
      if (res?.ok) {
        showStatus(res.archived > 0 ? `Archived ${res.archived} stale tab(s) to Read Later.` : "No stale tabs found.", "ok");
        if (res.archived > 0) earn("archive");
        if (res.archived > 0) showUndoBanner("Stale tabs archived.");
      } else {
        showStatus(res?.error === "no-activity-data" ? "No activity data yet. Use Stax for a bit first." : "Archive failed.", "error");
      }
    });
  });

  // ---- Merge / split windows ----
  document.getElementById("mergeWindowsBtn")?.addEventListener("click", async () => {
    const res = await sendMessage({ type: "MERGE_WINDOWS" });
    showStatus(res?.ok ? (res.merged > 0 ? `Merged ${res.merged} tab(s) into one window.` : "Already in one window.") : "Merge failed.", res?.ok ? "ok" : "error");
    if (res?.merged > 0) earn("merge");
    loadActiveGroups();
  });
  document.getElementById("splitWindowsBtn")?.addEventListener("click", async () => {
    await withCurrentWindow(async (windowId) => {
      const res = await sendMessage({ type: "SPLIT_WINDOWS", windowId });
      showStatus(res?.ok ? `Split into ${res.created} window(s).` : "No groups to split. Sort first.", res?.ok ? "ok" : "error");
      if (res?.ok) earn("split");
    });
  });

  // ---- Markdown export ----
  document.getElementById("exportMdBtn")?.addEventListener("click", async () => {
    await withCurrentWindow(async (windowId) => {
      const res = await sendMessage({ type: "EXPORT_MARKDOWN", windowId });
      if (res?.ok) {
        await navigator.clipboard.writeText(res.markdown).catch(() => {});
        showStatus(`${res.count} tabs copied as markdown.`, "ok");
        earn("export");
      } else {
        showStatus("Nothing to export.", "error");
      }
    });
  });

  // ---- Archive / Read Later panel ----
  // Archive is now accessible via the Read Later inbox accordion

  // ---- Stat strip ----
  async function refreshStatStrip() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.windowId) return;
      const hyg = await sendMessage({ type: "GET_HYGIENE", windowId: activeTab.windowId });
      if (!hyg?.ok) return;
      const pct = hyg.tabCount ? Math.round(hyg.groupedRatio * 100) : 0;
      const el = (id) => document.getElementById(id);
      if (el("stripTabCount"))   el("stripTabCount").textContent   = hyg.tabCount;
      if (el("stripGroupCount")) el("stripGroupCount").textContent = hyg.groupCount;
      if (el("stripGroupedPct")) el("stripGroupedPct").textContent = pct + "%";
      if (el("stripMoodIcon")) el("stripMoodIcon").innerHTML = moodFace(hyg.mood, 22);
    } catch { /* cosmetic */ }
  }
  refreshStatStrip();
  setInterval(refreshStatStrip, 15000);

  // ---- Inbox accordion toggles ----
  function setupInboxToggle(btnId, bodyId, loaderFn) {
    const btn  = document.getElementById(btnId);
    const body = document.getElementById(bodyId);
    if (!btn || !body) return;
    btn.addEventListener("click", async () => {
      const open = btn.classList.toggle("open");
      body.style.display = open ? "block" : "none";
      if (open) {
        if (loaderFn) await loaderFn();
        // Wait for the expand animation to establish the real height before
        // scrolling, otherwise we scroll to where it *was*.
        requestAnimationFrame(() => {
          btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      }
    });
  }
  setupInboxToggle("toggleSessions",  "sessionsList",       loadSessions);
  setupInboxToggle("toggleReadLater", "archiveBody",        loadArchive);
  setupInboxToggle("toggleRecent",    "recentlyClosedList", loadRecentlyClosed);
  setupInboxToggle("toggleAccessories", "accessoriesBody",  loadAccessories);

  async function refreshInboxCounts() {
    try {
      const [sessRes, archRes, recRes] = await Promise.all([
        sendMessage({ type: "LIST_SESSIONS" }),
        sendMessage({ type: "LIST_ARCHIVE" }),
        sendMessage({ type: "GET_RECENTLY_CLOSED" }),
      ]);
      const el = (id) => document.getElementById(id);
      if (el("sessionsCount")) el("sessionsCount").textContent = sessRes?.sessions?.length || 0;
      if (el("archiveCount"))  el("archiveCount").textContent  = Array.isArray(archRes) ? archRes.length : 0;
      if (el("recentCount"))   el("recentCount").textContent   = recRes?.tabs?.length || 0;
    } catch { /* cosmetic */ }
  }
  refreshInboxCounts();
  syncFocusBtn();
  syncStackletMood();

  // Published so the live-sync listeners (module scope) can call back into
  // these, which are closures over elements resolved here.
  window.__staxRefreshStrip = refreshStatStrip;
  window.__staxRefreshCounts = refreshInboxCounts;
  attachLiveSync();

  // A keyboard shortcut may have asked for a specific view.
  try {
    const { stax_open_view } = await chrome.storage.session.get(["stax_open_view"]);
    if (stax_open_view) {
      await chrome.storage.session.remove(["stax_open_view"]);
      switchView(stax_open_view);
    }
  } catch { /* session storage may be unavailable */ }

  // ---- View switching. Dashboard, Stacklet, and Find are views inside the
  // main screen rather than separate pages, so the header and tabs stay put
  // instead of the whole popup swapping out from under you.
  const views = {
    dashboard: document.getElementById("dashboardView"),
    stacklet:  document.getElementById("stackletView"),
    search:    document.getElementById("searchView"),
    stats:     document.getElementById("statsView"),
  };
  const navTabs = document.getElementById("navTabs");

  function switchView(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.style.display = key === name ? "block" : "none";
    });
    navTabs?.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    if (name === "stacklet") initStacklet();
    if (name === "search") openPaletteScreen();
    if (name === "stats") loadStatsView();
  }
  window.__staxSwitchView = switchView;

  navTabs?.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  // Perched Stacklet in the header: same character, same sleep/wake rules.
  const perched = document.getElementById("perchedStacklet");
  if (perched) {
    perched.innerHTML = stackletSvg();
    const pokeLines = [
      "Hey! Need a hand with those tabs?",
      "Poke me again and I'll sort everything.",
      "I'm watching your tab count. It's fine. Mostly.",
      "Tap the Stacklet tab and we can talk properly.",
    ];
    let pokes = 0;
    perched.addEventListener("click", () => {
      if (perched.classList.contains("sleeping")) {
        wakeStacklet(perched);
        perchedSay("Oh! I dozed off.");
        return;
      }
      pokes++;
      // Third poke takes the hint and opens his tab.
      if (pokes >= 3) { switchView("stacklet"); pokes = 0; return; }
      perchedSay(pokeLines[pokes % pokeLines.length]);
      earn("poke");
    });
    registerIdleSleeper(perched);
  }
});

function showUndoBanner(text) {
  const banner = document.getElementById("undoBanner");
  const textEl = document.getElementById("undoText");
  if (!banner || !textEl) return;
  textEl.textContent = text;
  banner.style.display = "flex";
  banner.dataset.real = "1";
  clearTimeout(showUndoBanner._t);
  // Undo only stays useful for a couple minutes server-side (see
  // UNDO_WINDOW_MS in background.js), hide the banner well before that
  // window closes so it never invites a click that's already too late.
  showUndoBanner._t = setTimeout(hideUndoBanner, 8000);
}

function hideUndoBanner() {
  const banner = document.getElementById("undoBanner");
  if (banner) { banner.style.display = "none"; delete banner.dataset.real; }
}

// ---- Saved sessions ----
async function loadSessions() {
  const list = document.getElementById("sessionsList");
  if (!list) return;
  try {
    const res = await sendMessage({ type: "LIST_SESSIONS" });
    const sessions = res?.sessions || [];

    if (!sessions.length) {
      list.innerHTML = `<div class="empty-state">No saved sessions yet</div>`;
      return;
    }

    list.innerHTML = "";
    for (const s of sessions) {
      const dateStr = new Date(s.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const item = document.createElement("div");
      item.className = "group-item";
      item.innerHTML = `
        <div style="display:flex; align-items:center; min-width: 0;">
          <span class="group-badge group-badge-grey">${icon("folder", 13)}</span>
          <span class="group-name">${escapeHtml(s.name)}</span>
          <span class="group-count">${s.tabCount}</span>
        </div>
        <div style="display:flex; gap: 4px; flex-shrink: 0;">
          <button class="btn-icon-small session-restore" title="Reopen (saved ${dateStr})">${icon("undo", 12)}</button>
          <button class="btn-icon-small session-delete" title="Delete">${icon("close", 12)}</button>
        </div>
      `;
      item.querySelector(".session-restore").addEventListener("click", async () => {
        const res2 = await sendMessage({ type: "RESTORE_SESSION", id: s.id });
        showStatus(res2?.ok ? `Reopened "${s.name}".` : "Couldn't reopen that session.", res2?.ok ? "ok" : "error");
      });
      item.querySelector(".session-delete").addEventListener("click", async () => {
        await sendMessage({ type: "DELETE_SESSION", id: s.id });
        loadSessions();
      });
      list.appendChild(item);
    }
  } catch (err) {
    console.warn("Stax: loadSessions failed", err);
    list.innerHTML = `<div class="empty-state">Couldn't load sessions.</div>`;
  }
}

// ---- Quick Switch (command palette): local fuzzy filter first, with an
// AI natural-language fallback for when you can't remember the exact
// title/URL of the tab you're after ----
async function openPaletteScreen() {
  const input = document.getElementById("paletteInput");
  const results = document.getElementById("paletteResults");
  const aiBtn = document.getElementById("paletteAiSearch");
  const msg = document.getElementById("paletteMsg");
  input.value = "";
  msg.textContent = "";
  aiBtn.style.display = "none";
  input.focus();

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = activeTab?.windowId;
  const allTabs = windowId != null ? await chrome.tabs.query({ windowId, pinned: false }) : [];

  function renderResults(list) {
    msg.textContent = "";
    if (!list.length) {
      results.innerHTML = `<div class="empty-state">No matching tabs</div>`;
      aiBtn.style.display = "block";
      return;
    }
    aiBtn.style.display = "none";
    results.innerHTML = "";
    list.slice(0, 20).forEach(t => {
      let host = "";
      try { host = new URL(t.url).hostname; } catch { /* ignore malformed URL */ }
      const item = document.createElement("div");
      item.className = "group-item";
      item.style.cursor = "pointer";
      item.innerHTML = `
        <div style="display:flex; align-items:center; min-width: 0;">
          <span class="group-badge group-badge-grey">${glyphFor(host)}</span>
          <span class="group-name">${escapeHtml(t.title || host || "Untitled tab")}</span>
        </div>
      `;
      item.addEventListener("click", async () => {
        await sendMessage({ type: "JUMP_TO_TAB", tabId: t.id });
        window.close();
      });
      results.appendChild(item);
    });
  }

  function filterLocal(query) {
    const q = query.trim().toLowerCase();
    if (!q) return allTabs;
    return allTabs.filter(t => (t.title || "").toLowerCase().includes(q) || (t.url || "").toLowerCase().includes(q));
  }

  renderResults(allTabs);

  // .oninput (not addEventListener), this function re-runs every time the
  // palette is opened, and re-adding a listener each time would stack up
  // duplicate handlers across the popup's lifetime. Assigning .oninput just
  // replaces the previous one instead.
  input.oninput = () => renderResults(filterLocal(input.value));

  aiBtn.onclick = async () => {
    const query = input.value.trim();
    if (!query) return;
    aiBtn.disabled = true;
    const originalHtml = aiBtn.innerHTML;
    aiBtn.innerHTML = `<span class="ai-spark">${icon("sparkle", 14)}</span>&nbsp;Asking AI\u2026`;
    const res = await sendMessage({ type: "AI_SEARCH_TABS", windowId, query });
    aiBtn.disabled = false;
    aiBtn.innerHTML = originalHtml;

    if (res?.ok && res.tabId != null) {
      await sendMessage({ type: "JUMP_TO_TAB", tabId: res.tabId });
      window.close();
    } else if (res?.error === "no-key") {
      msg.style.color = "var(--chip-red-ink)";
      msg.textContent = "No API key set, add one in Settings to use AI search.";
    } else if (res?.ok && res.tabId == null) {
      msg.style.color = "var(--chip-red-ink)";
      msg.textContent = "AI couldn't find a matching tab.";
    } else {
      msg.style.color = "var(--chip-red-ink)";
      msg.textContent = friendlyAiError(res?.error);
    }
  };
}

async function withCurrentWindow(fn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) await fn(tab.windowId);
}

function showStatus(text, kind = "info") {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;
  banner.textContent = text;
  banner.className = `status-banner show ${kind}`;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => banner.classList.remove("show"), 4000);
}

// ---- Onboarding wizard: click-to-select chips, single or multi per step ----
function initOnboardingWizard(onboardScreen, mainScreen, settingsScreen) {
  const steps = Array.from(onboardScreen.querySelectorAll(".wizard-step"));
  const dots = Array.from(onboardScreen.querySelectorAll(".wizard-dot"));
  const backBtn = document.getElementById("wizardBack");
  const nextBtn = document.getElementById("wizardNext");
  const hint = document.getElementById("wizardHint");
  const answers = { role: null, tabHabit: null, useCases: [], aiInterest: null, accent: null, wantsTutorial: null };
  let current = 0;

  // The accent step's chips are generated from the same preset list Settings
  // uses, so adding a theme never means editing onboarding markup too. Each
  // chip previews its own colour, and picking one applies it immediately so
  // the rest of the wizard is already wearing the chosen theme.
  const accentGridEl = document.getElementById("wizardAccentGrid");
  if (accentGridEl && !accentGridEl.children.length) {
    ACCENT_PRESETS.forEach(preset => {
      const chip = document.createElement("button");
      chip.className = "chip-option";
      chip.dataset.value = preset.id;
      chip.innerHTML = `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${preset.swatch};margin-right:7px;vertical-align:-1px;"></span>${preset.label}<span class="chip-check">✓</span>`;
      accentGridEl.appendChild(chip);
    });
    accentGridEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip-option");
      if (chip) applyAccent(chip.dataset.value);
    });
  }

  function answerKeyFor(step) {
    return step.querySelector(".chip-grid").dataset.question;
  }

  function isStepAnswered(step) {
    const key = answerKeyFor(step);
    const val = answers[key];
    return Array.isArray(val) ? val.length > 0 : !!val;
  }

  function renderStep() {
    steps.forEach((s, i) => s.classList.toggle("active", i === current));
    dots.forEach((d, i) => {
      d.classList.toggle("done", i < current);
      d.classList.toggle("active", i === current);
    });
    backBtn.style.display = current === 0 ? "none" : "flex";
    nextBtn.textContent = current === steps.length - 1 ? "Get Started" : "Continue";
    nextBtn.disabled = !isStepAnswered(steps[current]);
    hint.textContent = steps[current].querySelector(".chip-grid").dataset.mode === "multi"
      ? "Tap all the ones that fit, you can change these later in Settings."
      : "";
  }

  steps.forEach(step => {
    const grid = step.querySelector(".chip-grid");
    const key = grid.dataset.question;
    const mode = grid.dataset.mode;
    grid.querySelectorAll(".chip-option").forEach(chip => {
      chip.addEventListener("click", () => {
        const value = chip.dataset.value;
        if (mode === "single") {
          grid.querySelectorAll(".chip-option").forEach(c => c.classList.remove("selected"));
          chip.classList.add("selected");
          answers[key] = value;
        } else {
          chip.classList.toggle("selected");
          const list = new Set(answers[key]);
          if (chip.classList.contains("selected")) list.add(value);
          else list.delete(value);
          answers[key] = Array.from(list);
        }
        nextBtn.disabled = !isStepAnswered(step);
      });
    });
  });

  backBtn.addEventListener("click", () => {
    if (current > 0) { current--; renderStep(); }
  });

  nextBtn.addEventListener("click", async () => {
    if (current < steps.length - 1) {
      current++;
      renderStep();
      return;
    }
    // Last step, save everything and hand off to the main dashboard.
    // These are preferences, not secrets, so they sync across devices,
    // only API keys stay in .local (see the note in Settings).
    // The role answer seeds Stacklet's profile, so someone who said
    // "Developer" up front doesn't have to set it a second time in Settings.
    const roleToProfile = { Developer: "developer", Student: "research", PowerUser: "general", Other: "general" };

    await chrome.storage.sync.set({
      onboarded: true,
      userRole: answers.role,
      tabHabit: answers.tabHabit,
      useCases: answers.useCases,
      aiInterest: answers.aiInterest,
      accent: answers.accent || "sunrise",
      stackletProfile: roleToProfile[answers.role] || "general"
    });
    applyAccent(answers.accent || "sunrise");

    onboardScreen.style.display = "none";
    mainScreen.style.display = "block";
    loadActiveGroups();

    if (answers.aiInterest === "yes") {
      // Straight into the in-popup Settings screen, no separate window.
      mainScreen.style.display = "none";
      settingsScreen.style.display = "block";
      initSettingsScreen();
      const settingsMsg = document.getElementById("settingsMsg");
      if (settingsMsg) { settingsMsg.textContent = "Add your API key below to enable AI grouping."; settingsMsg.className = "wizard-hint"; }
    } else if (answers.wantsTutorial === "yes") {
      // Small delay so the dashboard has actually painted before the
      // spotlight tries to measure elements on it.
      setTimeout(startTutorial, 380);
    }
  });

  renderStep();
}

async function loadActiveGroups() {
  const groupsList = document.getElementById("activeGroupsList");
  if (!groupsList) return;
  try {
    const window = await chrome.windows.getCurrent();
    const groups = await chrome.tabGroups.query({ windowId: window.id });

    if (!groups.length) {
      groupsList.innerHTML = `<div class="empty-state">No active groups in this window</div>`;
      return;
    }

    groupsList.innerHTML = "";
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
        <button class="btn-icon-small" title="Ungroup" data-group-id="${g.id}">${icon("close", 12)}</button>
      `;
      item.querySelector("button").addEventListener("click", async (e) => {
        const groupId = Number(e.currentTarget.dataset.groupId);
        await sendMessage({ type: "UNGROUP_ONE", groupId });
        loadActiveGroups();
      });
      groupsList.appendChild(item);
    }
  } catch (err) {
    console.warn("Stax: loadActiveGroups failed", err);
    groupsList.innerHTML = `<div class="empty-state">Couldn't load groups. Try reloading the extension.</div>`;
  }
}

// ---- Settings screen (provider/keys/custom rules), lives entirely in the
// popup now; this replaces what used to be a separate options.html page. ----
const COLORS = ["blue", "purple", "green", "yellow", "pink", "cyan", "orange", "red", "grey"];
let settingsInitialized = false;

function colorOptionsHtml(selected) {
  return COLORS.map(c => `<option value="${c}" ${c === selected ? "selected" : ""}>${c[0].toUpperCase() + c.slice(1)}</option>`).join("");
}

function addRuleRow(rulesList, rule = { domains: "", name: "", color: "blue" }) {
  const card = document.createElement("div");
  card.className = "rule-card";
  card.innerHTML = `
    <div class="rule-card-row">
      <input type="text" class="text-input rule-domains" placeholder="Domains (e.g. jira.com, github.com)" value="${escapeHtml(rule.domains)}" />
    </div>
    <div class="rule-card-row">
      <input type="text" class="text-input rule-name" placeholder="Group Name" value="${escapeHtml(rule.name)}" />
      <select class="select-input rule-color" style="max-width: 110px;">${colorOptionsHtml(rule.color)}</select>
    </div>
    <div class="rule-card-footer">
      <button type="button" class="rule-remove-text">Remove rule</button>
    </div>
  `;
  card.querySelector(".rule-remove-text").addEventListener("click", () => card.remove());
  rulesList.appendChild(card);
}

function readRulesFromForm(rulesList) {
  const cards = rulesList.querySelectorAll(".rule-card");
  const rules = [];
  cards.forEach(card => {
    const domainsRaw = card.querySelector(".rule-domains").value.trim();
    const name = card.querySelector(".rule-name").value.trim();
    const color = card.querySelector(".rule-color").value;
    const domains = domainsRaw.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
    if (name && domains.length) rules.push({ name, domains, color });
  });
  return rules;
}

async function initSettingsScreen() {
  if (settingsInitialized) return; // wire listeners once; screen just toggles visibility after that
  settingsInitialized = true;

  const providerSelect = document.getElementById("provider");
  const anthropicFields = document.getElementById("anthropicFields");
  const geminiFields = document.getElementById("geminiFields");
  const keyInput = document.getElementById("key");
  const geminiKeyInput = document.getElementById("geminiKey");
  const geminiModelInput = document.getElementById("geminiModel");
  const settingsMsg = document.getElementById("settingsMsg");
  const rulesList = document.getElementById("rulesList");

  function syncProviderVisibility() {
    const isGemini = providerSelect.value === "gemini";
    anthropicFields.style.display = isGemini ? "none" : "block";
    geminiFields.style.display = isGemini ? "block" : "none";
  }
  providerSelect.addEventListener("change", syncProviderVisibility);

  const { provider = "anthropic", anthropicApiKey, geminiApiKey, geminiModel } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey", "geminiModel"]);
  const { customRules = [] } = await chrome.storage.sync.get(["customRules"]);

  providerSelect.value = provider;
  if (anthropicApiKey) keyInput.placeholder = "Key saved (hidden), enter a new one to replace it";
  if (geminiApiKey) geminiKeyInput.placeholder = "Key saved (hidden), enter a new one to replace it";
  geminiModelInput.value = geminiModel || "gemini-flash-latest";
  syncProviderVisibility();

  if (customRules.length) {
    customRules.forEach(r => addRuleRow(rulesList, { domains: (r.domains || []).join(", "), name: r.name, color: r.color || "blue" }));
  } else {
    addRuleRow(rulesList, { domains: "jira.atlassian.com, github.com", name: "Work", color: "blue" });
  }

  document.getElementById("addRule").addEventListener("click", () => addRuleRow(rulesList));

  document.getElementById("saveSettings").addEventListener("click", async () => {
    const provider = providerSelect.value;
    const localUpdates = { provider };

    if (provider === "anthropic") {
      const value = keyInput.value.trim();
      if (value) {
        if (!value.startsWith("sk-ant-")) {
          settingsMsg.textContent = "That doesn't look like an Anthropic key (should start with sk-ant-).";
          settingsMsg.style.color = "var(--chip-red-ink)";
          return;
        }
        localUpdates.anthropicApiKey = value;
      }
    } else {
      const value = geminiKeyInput.value.trim();
      if (value) localUpdates.geminiApiKey = value;
      localUpdates.geminiModel = geminiModelInput.value.trim() || "gemini-flash-latest";
    }

    const customRules = readRulesFromForm(rulesList);

    // chrome.storage.sync has an 8KB-per-item / 100KB-total quota. Enough
    // custom rules can blow through that, and the old code never checked,
    // it just told you "Saved." either way even if the write silently failed.
    try {
      await chrome.storage.local.set(localUpdates);
      await chrome.storage.sync.set({ customRules });
    } catch (err) {
      console.warn("Stax: failed to save settings", err);
      settingsMsg.style.color = "var(--chip-red-ink)";
      settingsMsg.textContent = "Couldn't save, you may have too many custom rules for sync storage. Try removing one.";
      return;
    }

    keyInput.value = "";
    geminiKeyInput.value = "";
    if (localUpdates.anthropicApiKey) keyInput.placeholder = "Key saved (hidden), enter a new one to replace it";
    if (localUpdates.geminiApiKey) geminiKeyInput.placeholder = "Key saved (hidden), enter a new one to replace it";

    settingsMsg.style.color = "var(--chip-green-ink)";
    settingsMsg.textContent = "Saved.";
  });

  document.getElementById("clearKeys").addEventListener("click", async () => {
    await chrome.storage.local.remove(["anthropicApiKey", "geminiApiKey"]);
    keyInput.placeholder = "sk-ant-…";
    geminiKeyInput.placeholder = "AIza…";
    settingsMsg.style.color = "var(--chip-green-ink)";
    settingsMsg.textContent = "Keys removed.";
  });
}
// ---- Stacklet: companion chat + action confirmation ----
// Conversation history lives only for as long as the popup is open. Persisting
// it would mean writing what the user works on to disk, which is more than a
// tab manager needs to keep, and the popup's lifetime matches how the feature
// is actually used anyway.
let stackletHistory = [];
let stackletInitialized = false;

function appendChatMessage(text, kind) {
  const log = document.getElementById("chatLog");
  if (!log) return null;
  const msg = document.createElement("div");
  msg.className = `chat-msg ${kind}`;
  msg.textContent = text;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
  return msg;
}

// Renders one proposed action as a confirm card. Stacklet can suggest, but
// nothing happens until this returns, that gate is the whole point, and it's
// only bypassed when the user has deliberately switched auto-run on.
function appendActionProposal(action, windowId) {
  const log = document.getElementById("chatLog");
  if (!log) return;

  const card = document.createElement("div");
  card.className = "action-proposal";
  card.innerHTML = `
    <div class="action-proposal-title"></div>
    <div class="action-proposal-desc"></div>
    <div class="action-proposal-btns">
      <button class="btn btn-secondary action-skip">Skip</button>
      <button class="btn btn-primary action-run">Do it</button>
    </div>
  `;
  card.querySelector(".action-proposal-title").textContent = action.label || "Suggested action";
  card.querySelector(".action-proposal-desc").textContent = describeAction(action);

  card.querySelector(".action-skip").addEventListener("click", () => {
    card.classList.add("resolved");
    card.querySelector(".action-proposal-btns").innerHTML = `<span class="action-resolved-note">Skipped</span>`;
  });

  card.querySelector(".action-run").addEventListener("click", async () => {
    const btns = card.querySelector(".action-proposal-btns");
    btns.innerHTML = `<span class="action-resolved-note">Running...</span>`;
    stackletDash();
    const res = await sendMessage({ type: "STACKLET_RUN_ACTION", action, windowId });
    card.classList.add("resolved");
    btns.innerHTML = `<span class="action-resolved-note">${res?.ok ? escapeHtml(res.detail || "Done") : "Couldn't run that"}</span>`;
    if (res?.ok) earn("action_run");
    loadActiveGroups();
  });

  log.appendChild(card);
  log.scrollTop = log.scrollHeight;
}

function describeAction(action) {
  switch (action.type) {
    case "group_tabs":   return `Groups ${action.tabIds?.length || 0} tabs as "${action.name || "Untitled"}".`;
    case "close_tabs":   return `Closes ${action.tabIds?.length || 0} tabs. Undo covers this for two minutes.`;
    case "suspend_tabs": return `Suspends ${action.tabIds?.length || 0} tabs to free memory. They reload when you click back in.`;
    case "rename_group": return `Renames a group to "${action.title || ""}".`;
    case "save_session": return `Saves the current tabs as "${action.name || "a session"}" so you can reopen them later.`;
    case "smart_sort":   return "Runs a full Smart Sort on this window.";
    case "dedupe":       return "Closes duplicate tabs across all windows.";
    case "open_tabs": {
      const urls = action.urls || [];
      const hosts = urls.map(u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } });
      const shown = hosts.slice(0, 4).join(", ");
      const more = hosts.length > 4 ? `, +${hosts.length - 4} more` : "";
      return `Opens ${urls.length} tab(s): ${shown}${more}.`;
    }
    default:             return "";
  }
}

async function sendToStacklet(message) {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  const msgLine = document.getElementById("stackletMsg");
  if (!message.trim()) return;

  msgLine.textContent = "";
  appendChatMessage(message, "user");
  stackletHistory.push({ role: "user", text: message });
  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;
  const figure = document.getElementById("stackletFigure");
  setStackletState(figure, "working");
  stackletSay("On it...", { hold: 1500 });

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = activeTab?.windowId;
  const res = await sendMessage({ type: "STACKLET_CHAT", windowId, message, history: stackletHistory });

  input.disabled = false;
  sendBtn.disabled = false;
  registerIdleSleeper(figure);
  input.focus();

  if (!res?.ok) {
    if (res?.error === "no-key") {
      msgLine.style.color = "var(--chip-red-ink)";
      msgLine.textContent = "No API key set, add one in Settings to talk to Stacklet.";
    } else if (res?.error === "bad-response") {
      appendChatMessage("I got confused there, mind rephrasing that?", "bot");
    } else {
      msgLine.style.color = "var(--chip-red-ink)";
      msgLine.textContent = friendlyAiError(res?.error);
    }
    return;
  }

  appendChatMessage(res.reply, "bot");
  stackletHistory.push({ role: "assistant", text: res.reply });
  earn("chat");

  for (const action of res.actions || []) {
    if (res.autoRun) {
      // Auto-run is opt-in and off by default. Even here the result is
      // reported in the log rather than happening silently, so there's
      // always a visible trail of what Stacklet did on its own.
      const runRes = await sendMessage({ type: "STACKLET_RUN_ACTION", action, windowId });
      appendChatMessage(
        runRes?.ok ? `\u2713 ${action.label}, ${runRes.detail || "done"}` : `\u2717 Couldn't run: ${action.label}`,
        "system"
      );
      loadActiveGroups();
    } else {
      appendActionProposal(action, windowId);
    }
  }
}

async function initStacklet() {
  const input = document.getElementById("chatInput");
  const log = document.getElementById("chatLog");
  const figure = document.getElementById("stackletFigure");

  if (!stackletInitialized) {
    stackletInitialized = true;

    if (figure) {
      figure.innerHTML = stackletSvg();
      figure.addEventListener("click", () => {
        if (figure.classList.contains("sleeping")) {
          wakeStacklet(figure);
          stackletSay("Oh! I'm up, I'm up.");
        } else {
          stackletStroll();
        }
      });
      registerIdleSleeper(figure);
      // A slow amble every so often, so he feels alive without being noisy.
      setInterval(() => { if (Math.random() < 0.4) stackletStroll(); }, 9000);
    }

    document.getElementById("chatSend")?.addEventListener("click", () => sendToStacklet(input.value));
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendToStacklet(input.value);
      }
    });
    document.getElementById("stackletAnalyze")?.addEventListener("click", () => {
      sendToStacklet("Look at my open tabs and tell me what I seem to be working on right now.");
    });
    document.getElementById("stackletTidy")?.addEventListener("click", () => {
      sendToStacklet("Suggest how I could tidy up these tabs.");
    });

    const { stackletAutoRun = false } = await chrome.storage.sync.get(["stackletAutoRun"]);
    if (stackletAutoRun) stackletSay("Auto-run is on, so I'll just get on with things.");
    else stackletSay("Hey! Ask me anything about your tabs.");
    await syncStackletMood();
    loadAccessories();
    if (log && !log.children.length) {
      appendChatMessage(
        stackletAutoRun
          ? "Hey, I'm Stacklet. Auto-run is on, so I'll carry out what I suggest without asking. Say the word."
          : "Hey, I'm Stacklet. I can see your tab titles and hostnames, and I'll always ask before changing anything.",
        "bot"
      );
    }
  }

  input?.focus();
}

// ---- Stacklet: character behaviour ----
// Sleep timers are per-element because the same character is mounted in more
// than one place (perched on the logo, on his own tab, in the tutorial) and
// each copy nods off on its own schedule.
const SLEEP_AFTER_MS = 45000;
const sleepTimers = new WeakMap();

function setStackletState(el, state) {
  if (!el) return;
  el.classList.remove("idle", "sleeping", "waking", "walking", "working");
  el.classList.add(state);
}

function registerIdleSleeper(el) {
  if (!el) return;
  clearTimeout(sleepTimers.get(el));
  setStackletState(el, "idle");
  sleepTimers.set(el, setTimeout(() => setStackletState(el, "sleeping"), SLEEP_AFTER_MS));
}

function wakeStacklet(el) {
  if (!el) return;
  clearTimeout(sleepTimers.get(el));
  setStackletState(el, "waking");
  // The wake pop is a one-shot animation; hand back to idle once it ends so
  // the breathing loop can take over again.
  setTimeout(() => registerIdleSleeper(el), 550);
}

// Where Stacklet currently is on his strip, in px from the left. Kept in a
// variable rather than read back off the transform each time: mid-transition
// the computed value is wherever the animation happens to be, not the target,
// which made footprints and the speech bubble land in the wrong place.
let stackletX = 0;

function stackletTravelLimit() {
  const stage = document.getElementById("stackletStage");
  const figure = document.getElementById("stackletFigure");
  if (!stage || !figure) return 0;
  return Math.max(0, stage.clientWidth - figure.offsetWidth - 2);
}

// Drops a footprint at his current spot. Capped at three on screen so they
// read as a short trail rather than a line of dots across the whole strip.
function dropFootprint(x, side) {
  const stage = document.getElementById("stackletStage");
  if (!stage) return;

  const prints = stage.querySelectorAll(".stk-footprint");
  if (prints.length >= 3) prints[0].remove();

  const print = document.createElement("div");
  print.className = "stk-footprint";
  print.style.left = `${Math.max(0, x + 12 + (side ? 6 : 0))}px`;
  stage.appendChild(print);
  // The fade is a CSS animation; clean the node up once it has finished so
  // they don't pile up in the DOM over a long session.
  setTimeout(() => print.remove(), 1600);
}

// Lays a few prints along the path he's about to walk, spaced across the
// duration so they appear underneath him as he goes rather than all at once.
function trailFootprints(fromX, toX, durationMs) {
  const steps = 3;
  for (let i = 1; i <= steps; i++) {
    setTimeout(() => {
      dropFootprint(fromX + ((toX - fromX) * i) / steps, i % 2);
    }, (durationMs / steps) * i * 0.8);
  }
}

// The bubble is a child of the figure now, so it follows him with no work.
// All that's left is picking which side to anchor on when he's close enough
// to a stage edge that a centred bubble would overflow.
function positionBubble() {
  const figure = document.getElementById("stackletFigure");
  const stage = document.getElementById("stackletStage");
  const bubble = document.getElementById("stackletBubble");
  if (!figure || !stage || !bubble) return;

  const half = bubble.offsetWidth / 2;
  const centre = stackletX + figure.offsetWidth / 2;
  figure.classList.remove("bubble-left", "bubble-right");
  if (centre - half < 2) figure.classList.add("bubble-right");
  else if (centre + half > stage.clientWidth - 2) figure.classList.add("bubble-left");
}

const typeTimers = new WeakMap();
function typeInto(el, text, speed = 18) {
  return new Promise(resolve => {
    el.textContent = "";
    const caret = document.createElement("span");
    caret.className = "type-caret";
    el.appendChild(caret);
    let i = 0;
    clearInterval(typeTimers.get(el));
    const timer = setInterval(() => {
      if (i >= text.length) {
        clearInterval(timer);
        typeTimers.delete(el);
        caret.remove();
        resolve();
        return;
      }
      caret.insertAdjacentText("beforebegin", text[i++]);
    }, speed);
    typeTimers.set(el, timer);
  });
}

async function stackletSay(text, { hold = 3200 } = {}) {
  const bubble = document.getElementById("stackletBubble");
  const figure = document.getElementById("stackletFigure");
  if (!bubble || !figure) return;
  wakeStacklet(figure);
  positionBubble();
  bubble.classList.add("show");
  await typeInto(bubble, text);
  positionBubble(); // width changed while typing, so re-check the edge
  clearTimeout(stackletSay._t);
  stackletSay._t = setTimeout(() => bubble.classList.remove("show"), hold);
}

// Speaks from the Stacklet perched on the logo. Used for reactions that
// should be visible from the dashboard, where the chat bubble is off-screen.
async function perchedSay(text, { hold = 3400 } = {}) {
  const bubble = document.getElementById("perchedBubble");
  const figure = document.getElementById("perchedStacklet");
  if (!bubble || !figure) return;
  wakeStacklet(figure);
  bubble.classList.add("show");
  await typeInto(bubble, text, 16);
  clearTimeout(perchedSay._t);
  perchedSay._t = setTimeout(() => bubble.classList.remove("show"), hold);
}

// Reacts on whichever Stacklet the user can currently see.
function stackletReact(text) {
  const stackletTabOpen = document.getElementById("stackletView")?.style.display === "block";
  if (stackletTabOpen) stackletSay(text);
  else perchedSay(text);
}

// Sends Stacklet dashing across his strip and back. Used while an action is
// actually running, so the wait reads as him doing the work.
async function stackletDash() {
  const figure = document.getElementById("stackletFigure");
  if (!figure) return;

  const travel = stackletTravelLimit();
  figure.classList.add("dash");
  setStackletState(figure, "working");

  trailFootprints(stackletX, travel, 340);
  stackletX = travel;
  figure.style.transform = `translateX(${travel}px)`;
  positionBubble();
  await new Promise(r => setTimeout(r, 360));

  figure.classList.add("flipped");
  trailFootprints(travel, 0, 340);
  stackletX = 0;
  figure.style.transform = "translateX(0)";
  positionBubble();
  await new Promise(r => setTimeout(r, 360));

  figure.classList.remove("flipped", "dash");
  registerIdleSleeper(figure);
}

// A slower amble, for idle moments rather than work.
function stackletStroll() {
  const figure = document.getElementById("stackletFigure");
  if (!figure || figure.classList.contains("working")) return;

  const travel = stackletTravelLimit();
  const target = Math.random() * travel;
  if (Math.abs(target - stackletX) < 24) return;

  figure.classList.toggle("flipped", target < stackletX);
  setStackletState(figure, "walking");
  trailFootprints(stackletX, target, 900);
  stackletX = target;
  figure.style.transform = `translateX(${target}px)`;
  positionBubble();
  setTimeout(() => registerIdleSleeper(figure), 900);
}

// ---- Guided tutorial ----
// Each step names a real element by id. The spotlight measures that element
// live rather than storing coordinates, so it stays correct no matter how the
// layout reflows between popup sizes or themes.
// Each step names a real element by id and, optionally, a view to switch to
// first. The spotlight measures the live element rather than storing
// coordinates, so steps stay correct if the layout reflows.
const TUTORIAL_STEPS = [
  {
    target: null, view: "dashboard",
    text: "Hi, I'm Stacklet! I live up on the logo. Let me walk you through everything, it takes about a minute."
  },
  {
    target: "perchedStacklet", view: "dashboard",
    text: "That's me. Poke me any time and I'll say something. Poke me three times and I'll open my own tab."
  },
  {
    target: "navTabs", view: "dashboard",
    text: "Four tabs run the whole app. Tabs is your dashboard, Stacklet is me, Find jumps to any open tab, Stats shows where your time went."
  },
  {
    target: "quickSort", view: "dashboard",
    text: "Smart Sort is the main one. It sorts every tab into colour-coded groups using local rules, instantly and offline. AI only touches what the rules can't place."
  },
  {
    target: "statStrip", view: "dashboard",
    text: "Live numbers: how many tabs you have, how many groups, what share is grouped, and my mood. I get visibly stressed past about 35 tabs."
  },
  {
    target: "activeGroupsList", view: "dashboard",
    text: "Your groups show up here. The X removes one. The side panel gives you the same list plus rename, collapse, and move-to-new-window."
  },
  {
    target: "dedupe", view: "dashboard",
    text: "Deduplicate closes repeated URLs across every window. It normalises tracking junk first, so the same article from three different links still counts as one."
  },
  {
    target: "suspendInactive", view: "dashboard",
    text: "Suspend frees the memory used by tabs you haven't touched in 20 minutes. They reload the moment you click back in. Nothing playing audio gets touched."
  },
  {
    target: "focusBtn", view: "dashboard",
    text: "Focus collapses every group except the one you're working in. Click again and everything goes back exactly how it was."
  },
  {
    target: "saveSessionBtn", view: "dashboard",
    text: "Save Session snapshots your tabs and their groups under a name. Close everything, reopen the whole set later, even after a restart."
  },
  {
    target: "archiveStaleBtn", view: "dashboard",
    text: "Archive Stale closes tabs you haven't opened in a week but saves them to Read Later first. This is the one that fixes tab hoarding."
  },
  {
    target: "mergeWindowsBtn", view: "dashboard",
    text: "Merge pulls every window into one. Split does the opposite, giving each group its own window. Handy either side of a big cleanup."
  },
  {
    target: "exportMdBtn", view: "dashboard",
    text: "Export copies every tab to your clipboard as a markdown link list, grouped by category. Good for dropping a research session into notes."
  },
  {
    target: "aiSort", view: "dashboard",
    text: "This re-sorts everything with AI from scratch, ignoring the local rules. Optional, and it needs your own API key."
  },
  {
    target: "undoBanner", view: "dashboard", showUndo: true,
    text: "Anything destructive can be undone for two minutes. A banner like this appears after a sort or a close, so a misclick is never permanent."
  },
  {
    target: "toggleSessions", view: "dashboard",
    text: "Everything you save lives here: sessions, Read Later, and recently closed tabs. Each one expands on click."
  },
  {
    target: "chatInput", view: "stacklet",
    text: "This is my tab. Ask me what you're working on, or to tidy up. I can see your tab titles and hostnames, never page content."
  },
  {
    target: "stackletAnalyze", view: "stacklet",
    text: "These two are shortcuts for the things people ask most. I'll propose actions and you approve them before anything happens."
  },
  {
    target: "toggleAccessories", view: "stacklet",
    text: "Every action you take earns points, and points unlock accessories for me. Hats, glasses, a cape eventually. Open this to see what's next."
  },
  {
    target: "paletteInput", view: "search",
    text: "Find filters your open tabs as you type. If you can only describe the tab rather than name it, there's an AI fallback underneath."
  },
  {
    target: "statWeekTotal", view: "stats", statsDemo: true,
    text: "Stats tracks time per category per day, entirely on your machine. This is sample data, your real numbers come back the moment we're done."
  },
  {
    target: "openSettings", view: "dashboard",
    text: "Settings holds your theme, accent colour, custom domain rules, and API key. That's everything, go make a mess of some tabs."
  }
];

let tutorialIndex = 0;

// Re-measures the current step's target. Bound to scroll and resize while
// the tutorial is open, because the spotlight is position:fixed while the
// target lives in a scrolling container: without this the highlight stays
// put and the element slides out from under it.
let spotlightTargetId = null;
let spotlightRaf = null;
function refreshSpotlight() {
  if (!spotlightTargetId) return;
  cancelAnimationFrame(spotlightRaf);
  spotlightRaf = requestAnimationFrame(() => positionSpotlight(spotlightTargetId, { remeasureOnly: true }));
}

function positionSpotlight(targetId, { remeasureOnly = false } = {}) {
  spotlightTargetId = targetId;
  const spot = document.getElementById("tutorialSpotlight");
  const card = document.getElementById("tutorialCard");
  if (!spot || !card) return;

  if (!targetId) {
    // Intro step has no target: park the spotlight off-screen so the whole
    // popup just dims evenly behind the card.
    spot.style.cssText = "width:0;height:0;top:-50px;left:50%;opacity:0;";
    card.style.top = "";
    card.style.bottom = "16px";
    return;
  }

  const el = document.getElementById(targetId);
  if (!el) return positionSpotlight(null);

  const r = el.getBoundingClientRect();
  const pad = 6;
  spot.style.opacity = "1";
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;
  spot.style.top = `${r.top - pad}px`;
  spot.style.left = `${r.left - pad}px`;

  // Put the card on whichever side has room, then verify it actually clears
  // the highlighted element. Measuring the card (rather than assuming a
  // fixed height) is what stops it sitting on top of what it describes,
  // which is exactly what happened to the settings gear on the last step.
  const cardH = card.offsetHeight || 150;
  const gap = 16;
  const spaceBelow = window.innerHeight - r.bottom;
  const spaceAbove = r.top;

  if (spaceBelow >= cardH + gap) {
    card.style.top = `${r.bottom + gap}px`;
    card.style.bottom = "";
  } else if (spaceAbove >= cardH + gap) {
    card.style.top = "";
    card.style.bottom = `${window.innerHeight - r.top + gap}px`;
  } else {
    // Neither side fits cleanly. Take the roomier one and clamp so the card
    // stays fully on screen rather than running off an edge.
    if (spaceBelow >= spaceAbove) {
      card.style.top = `${Math.min(r.bottom + gap, Math.max(gap, window.innerHeight - cardH - gap))}px`;
      card.style.bottom = "";
    } else {
      card.style.top = "";
      card.style.bottom = `${Math.min(window.innerHeight - r.top + gap, Math.max(gap, window.innerHeight - cardH - gap))}px`;
    }
  }
}

function renderTutorialPips() {
  const pips = document.getElementById("tutorialPips");
  if (!pips) return;
  pips.innerHTML = "";
  TUTORIAL_STEPS.forEach((_, i) => {
    const pip = document.createElement("div");
    pip.className = `tutorial-pip${i === tutorialIndex ? " active" : i < tutorialIndex ? " done" : ""}`;
    pips.appendChild(pip);
  });
}

async function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  const textEl = document.getElementById("tutorialText");
  const countEl = document.getElementById("tutorialCount");
  const backBtn = document.getElementById("tutorialBack");
  const nextBtn = document.getElementById("tutorialNext");

  // Switch to the view holding this step's target, fading between them, then
  // wait for paint. Measuring a display:none element returns zeroes and the
  // spotlight would land in the corner.
  if (step.view) {
    await switchViewAnimated(step.view);
  }

  // Smooth-scroll the target into the middle of the container and WAIT for
  // the scroll to actually finish before measuring. Measuring mid-scroll is
  // what made highlights land in the wrong place.
  const targetEl = step.target ? document.getElementById(step.target) : null;
  if (targetEl) {
    targetEl.scrollIntoView({ block: "center", behavior: "smooth" });
    await waitForScrollEnd(document.querySelector(".popup-container"));
  }
  // The undo banner is normally hidden, so reveal it for its own step
  // rather than spotlighting an invisible element.
  const undoBanner = document.getElementById("undoBanner");
  if (undoBanner) {
    if (step.showUndo) {
      document.getElementById("undoText").textContent = "Example: a sort just ran.";
      undoBanner.style.display = "flex";
    } else if (!undoBanner.dataset.real) {
      undoBanner.style.display = "none";
    }
  }

  countEl.textContent = `STEP ${tutorialIndex + 1} OF ${TUTORIAL_STEPS.length}`;
  backBtn.style.visibility = tutorialIndex === 0 ? "hidden" : "visible";
  nextBtn.textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next";
  renderTutorialPips();

  // Set the full text before positioning so the card is measured at its
  // final height. Positioning against an empty (short) card meant a long
  // step could grow downward afterwards and cover its own target.
  textEl.textContent = step.text;
  positionSpotlight(step.target);

  // Leaving the stats step restores the user's real figures.
  if (!step.statsDemo && statsDemoSaved) restoreStatsAfterDemo();

  await typeInto(textEl, step.text, 16);

  // Synthetic data animates in only after the explanation is on screen,
  // so the motion doesn't compete with the text for attention.
  if (step.statsDemo) playStatsDemo();
}

async function startTutorial() {
  const overlay = document.getElementById("tutorialOverlay");
  const mascot = document.getElementById("tutorialStacklet");
  if (!overlay) return;

  // The tutorial points at dashboard controls, so make sure that view is the
  // one actually on screen before measuring anything.
  window.__staxSwitchView?.("dashboard");
  if (mascot && !mascot.children.length) mascot.innerHTML = stackletSvg();
  registerIdleSleeper(mascot);

  tutorialIndex = 0;
  overlay.classList.add("show");

  // The spotlight is fixed-position while its targets scroll, so it has to
  // re-measure on every scroll and resize for as long as the tutorial runs.
  const scroller = document.querySelector(".popup-container");
  scroller?.addEventListener("scroll", refreshSpotlight, { passive: true });
  window.addEventListener("resize", refreshSpotlight);
  startTutorial._detach = () => {
    scroller?.removeEventListener("scroll", refreshSpotlight);
    window.removeEventListener("resize", refreshSpotlight);
  };

  await renderTutorialStep();
}

function endTutorial() {
  startTutorial._detach?.();
  startTutorial._detach = null;
  spotlightTargetId = null;
  if (statsDemoSaved) restoreStatsAfterDemo();
  document.getElementById("tutorialOverlay")?.classList.remove("show");
  const banner = document.getElementById("undoBanner");
  if (banner && !banner.dataset.real) banner.style.display = "none";
  window.__staxSwitchView?.("dashboard");
  chrome.storage.sync.set({ tutorialDone: true });
}

// Completing it is worth a chunk of points, which usually lands the first
// accessory right as the tutorial ends.
async function finishTutorial() {
  const { tutorialRewarded = false } = await chrome.storage.sync.get(["tutorialRewarded"]);
  endTutorial();
  if (!tutorialRewarded) {
    await chrome.storage.sync.set({ tutorialRewarded: true });
    earn("tutorial");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("tutorialNext")?.addEventListener("click", async () => {
    if (tutorialIndex >= TUTORIAL_STEPS.length - 1) {
      finishTutorial();
      return;
    }
    tutorialIndex++;
    await renderTutorialStep();
  });

  document.getElementById("tutorialBack")?.addEventListener("click", async () => {
    if (tutorialIndex === 0) return;
    tutorialIndex--;
    await renderTutorialStep();
  });

  document.getElementById("tutorialSkip")?.addEventListener("click", endTutorial);

  document.getElementById("replayTutorial")?.addEventListener("click", () => {
    document.getElementById("settingsScreen").style.display = "none";
    document.getElementById("mainScreen").style.display = "block";
    startTutorial();
  });
});

// ---- Recently Closed ----
async function loadRecentlyClosed() {
  const list = document.getElementById("recentlyClosedList");
  if (!list) return;
  try {
    const res = await sendMessage({ type: "GET_RECENTLY_CLOSED" });
    const tabs = res?.tabs || [];

    // Update the inbox count badge
    const countEl = document.getElementById("recentCount");
    if (countEl) countEl.textContent = tabs.length;

    if (!tabs.length) {
      list.innerHTML = `<div class="empty-state">Nothing closed recently</div>`;
      return;
    }

    list.innerHTML = "";
    tabs.slice(0, 10).forEach(t => {
      let host = "";
      try { host = new URL(t.url).hostname.replace(/^www\./, ""); } catch {}
      const item = document.createElement("div");
      item.className = "group-item";
      item.style.cursor = "pointer";
      item.innerHTML = `
        <div style="display:flex; align-items:center; min-width:0; flex:1; gap:7px;">
          <img src="https://www.google.com/s2/favicons?sz=16&domain=${encodeURIComponent(host)}" width="14" height="14" style="border-radius:3px;flex-shrink:0;" onerror="this.style.display='none'">
          <span class="group-name" style="font-weight:600;">${escapeHtml(t.title || host || "Untitled")}</span>
          <span class="group-count" style="font-size:10.5px;">${escapeHtml(host)}</span>
        </div>
        <button class="btn-icon-small" title="Reopen" data-session="${escapeHtml(t.sessionId || "")}">${icon("undo", 12)}</button>
      `;
      const restore = async () => {
        await sendMessage({ type: "RESTORE_RECENTLY_CLOSED", sessionId: t.sessionId });
        setTimeout(loadRecentlyClosed, 400);
      };
      item.addEventListener("click", restore);
      item.querySelector("button").addEventListener("click", (e) => { e.stopPropagation(); restore(); });
      list.appendChild(item);
    });
  } catch (err) {
    console.warn("Stax: loadRecentlyClosed failed", err);
    list.innerHTML = `<div class="empty-state">Couldn't load recent tabs.</div>`;
  }
}

// ---- Archive / Read Later ----
async function loadArchive() {
  const list = document.getElementById("archiveList");
  if (!list) return;
  try {
    const res = await sendMessage({ type: "LIST_ARCHIVE" });
    archiveCache = Array.isArray(res) ? res : [];
    const countEl = document.getElementById("archiveCount");
    if (countEl) countEl.textContent = archiveCache.length;
    wireArchiveSearch();
    const input = document.getElementById("archiveSearch");
    const q = (input?.value || "").trim().toLowerCase();
    renderArchiveList(q
      ? archiveCache.filter(a => (a.title || "").toLowerCase().includes(q) || (a.url || "").toLowerCase().includes(q))
      : archiveCache);
  } catch (err) {
    console.warn("Stax: loadArchive failed", err);
    list.innerHTML = `<div class="empty-state">Couldn't load archive.</div>`;
  }
}

// CATEGORY_COLORS and fmtMs are used by loadStatsView
const CATEGORY_COLORS = {
  "Development":   "#8fc4f7",
  "AI & ML":       "#c9a7f5",
  "Productivity":  "#f7c948",
  "Research":      "#9ee0be",
  "Communication": "#f5a9c4",
  "Finance & Pay": "#9ee0be",
  "Shopping":      "#f7a978",
  "Entertainment": "#f5a9c4",
  "Social & Media":"#f7a978",
  "Uncategorised": "#b9b5ab"
};

function fmtMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}


// ---- Icon hydration ----
// Markup declares which icon it wants via data-icon; this fills them in
// after load. Keeps the HTML free of inlined SVG (which made it unreadable)
// while still shipping real vectors rather than font-dependent emoji.
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    if (el.dataset.iconDone) return;
    const size = Number(el.dataset.iconSize) || (el.classList.contains("tool-tile-icon") ? 19 : 17);
    const svg = icon(el.dataset.icon, size);
    if (svg) {
      el.innerHTML = svg;
      el.dataset.iconDone = "1";
    }
  });
}

// Small vector previews for the accessory picker, matching how each item
// actually looks on the character rather than a stand-in emoji.
const ACCESSORY_GLYPH = {
  hat:        '<svg viewBox="0 0 24 24" width="20" height="20"><ellipse cx="12" cy="16" rx="9" ry="2.2" fill="#2e1c44"/><path d="M7.5 15.5V9a4.5 1.8 0 019 0v6.5z" fill="#3a2456"/><path d="M7.5 14h9" stroke="#f7c948" stroke-width="1.6"/></svg>',
  glasses:    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7.5" cy="13" r="4.2"/><circle cx="16.5" cy="13" r="4.2"/><path d="M11.7 12.4q1.2-1 1.6 0M3.3 11L5 8.5M20.7 11L19 8.5"/></svg>',
  scarf:      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 10q8 4 16 0v3.4q-8 4-16 0z" fill="#d9455b"/><path d="M15 13q3 1.4 2.6 6.2-1.8 1-3-.5-.5-2.8.4-5.7z" fill="#c93c50"/></svg>',
  crown:      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 16L5.6 6l4 4L12 3l2.4 7 4-4L20 16z" fill="#f2c230"/><rect x="4" y="16" width="16" height="2.4" fill="#dba81f"/><circle cx="12" cy="8" r="1.3" fill="#e8556d"/></svg>',
  backpack:   '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="6" y="7" width="12" height="14" rx="4" fill="#4a9fd4"/><rect x="8.5" y="10" width="7" height="5" rx="2" fill="#2f7fb0" opacity="0.7"/><path d="M8.5 8Q7 3.5 10 2.5M15.5 8Q17 3.5 14 2.5" stroke="#4a9fd4" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  stars:      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3l1.5 3.6L17 8l-3.5 1.4L12 13l-1.5-3.6L7 8l3.5-1.4z" fill="#f7c948"/><path d="M18.5 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="#f7c948" opacity="0.7"/><circle cx="5" cy="17" r="1.4" fill="#f7c948" opacity="0.6"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 14Q5 4 12 4t7 10" stroke="#2b2438" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="2.5" y="12.5" width="4.6" height="7.5" rx="2.3" fill="#2b2438"/><rect x="16.9" y="12.5" width="4.6" height="7.5" rx="2.3" fill="#2b2438"/></svg>',
  cape:       '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 6Q1 17 5.5 22 12 18 18.5 22 23 17 19 6 12 10 5 6z" fill="#7b4fc9"/><path d="M5 6q7 4 14 0" stroke="#5c37a0" stroke-width="1.2" fill="none"/></svg>',
};

// ---- Stacklet mood + accessories ----
let currentMood = "happy";
let currentAccessory = null;

function celebrateStacklet(el) {
  if (!el) return;
  el.classList.remove("celebrate");
  void el.offsetWidth; // force reflow so re-adding the class retriggers the animation
  el.classList.add("celebrate");
  setTimeout(() => el.classList.remove("celebrate"), 750);
}

function applyMood(el, mood, accessory) {
  if (!el) return;
  ["mood-happy","mood-neutral","mood-stressed","mood-buried"].forEach(c => el.classList.remove(c));
  el.classList.add(`mood-${mood || "happy"}`);
  // Rebuild the SVG with the new mood and accessory. We rebuild rather than
  // mutating individual paths because SVG linearGradient stops don't update
  // reliably via CSS class changes in Chrome when inside a shadow-style context.
  el.innerHTML = stackletSvg(mood || "happy", accessory || null);
}

async function syncStackletMood() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.windowId) return;
  const res = await sendMessage({ type: "GET_HYGIENE", windowId: activeTab.windowId });
  if (!res?.ok) return;

  const mood = res.mood || "happy";
  const accRes = await sendMessage({ type: "GET_ACCESSORIES" });
  const equipped = accRes?.equipped || null;

  if (mood !== currentMood || equipped !== currentAccessory) {
    currentMood = mood;
    currentAccessory = equipped;
    const figures = [
      document.getElementById("stackletFigure"),
      document.getElementById("perchedStacklet"),
      document.getElementById("tutorialStacklet"),
    ];
    figures.forEach(el => {
      if (el) applyMood(el, mood, equipped);
    });
  }

  // Update the perched Stacklet's title tooltip so hovering shows the mood
  const perched = document.getElementById("perchedStacklet");
  if (perched) {
    const msgs = { happy:"Stacklet is happy!", neutral:"Stacklet thinks you could tidy up...", stressed:"Stacklet is stressed about all these tabs.", buried:"Stacklet is buried. Help!" };
    perched.title = msgs[mood] || "Stacklet";
  }
}

function showUnlockToast(item) {
  const toast = document.getElementById("unlockToast");
  if (!toast) return;
  toast.innerHTML = `${icon("sparkle", 15)}<span>Unlocked: ${escapeHtml(item.label)}</span>`;
  toast.classList.add("show");
  clearTimeout(showUnlockToast._t);
  showUnlockToast._t = setTimeout(() => toast.classList.remove("show"), 3200);
}

async function loadAccessories() {
  const grid = document.getElementById("accessoriesGrid");
  const hint = document.getElementById("accessoryHint");
  if (!grid) return;

  const res = await sendMessage({ type: "GET_ACCESSORIES" });
  if (!res?.ok) return;

  const unlocked = res.all.filter(a => a.unlocked).length;
  if (hint) hint.textContent = `${unlocked}/${res.all.length}`;

  // Level row
  const badge = document.getElementById("levelBadge");
  const bar = document.getElementById("levelBar");
  const pts = document.getElementById("levelPoints");
  const lvlHint = document.getElementById("levelHint");
  if (badge) badge.textContent = `LV ${res.level}`;
  if (bar) bar.style.width = `${res.progressToNext}%`;
  if (pts) pts.textContent = `${res.points} pts`;
  if (lvlHint) {
    const next = res.all.find(a => !a.unlocked);
    lvlHint.textContent = next
      ? `${next.remaining} more points to unlock ${next.label}.`
      : "Everything unlocked. Stacklet is fully dressed.";
  }

  grid.innerHTML = "";
  res.all.forEach(item => {
    const chip = document.createElement("button");
    chip.className = `accessory-chip${item.unlocked ? "" : " locked"}${res.equipped === item.id ? " equipped" : ""}`;
    chip.title = item.unlocked
      ? (res.equipped === item.id ? "Equipped, click to take it off" : `Equip ${item.label}`)
      : `Unlocks at ${item.cost} points`;
    chip.innerHTML = `
      <span class="accessory-icon">${ACCESSORY_GLYPH[item.id] || ""}</span>
      <span class="accessory-label">${escapeHtml(item.label)}</span>
      ${item.unlocked ? "" : `<span class="accessory-cost">${item.cost} pts</span>`}
    `;
    if (item.unlocked) {
      chip.addEventListener("click", async () => {
        const newId = res.equipped === item.id ? null : item.id;
        await sendMessage({ type: "EQUIP_ACCESSORY", id: newId });
        currentAccessory = newId;
        await syncStackletMood();
        loadAccessories();
      });
    }
    grid.appendChild(chip);
  });
}

// Shows a floating "+N" near the points counter. Anchored to the counter if
// it's visible, otherwise to the perched Stacklet, so the feedback always
// appears somewhere the user is actually looking.
function showPointPop(gained) {
  if (!gained) return;
  const anchor = document.getElementById("levelPoints")
    || document.getElementById("perchedStacklet");
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "point-pop";
  pop.textContent = `+${gained}`;
  pop.style.left = `${r.left + r.width / 2 - 10}px`;
  pop.style.top = `${r.top - 6}px`;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1150);
}

// Single entry point for awarding points. Every interaction that should pay
// out goes through here so the reward rules live in one place rather than
// being sprinkled through each button handler.
async function earn(kind, multiplier = 1) {
  const res = await sendMessage({ type: "AWARD_POINTS", kind, multiplier });
  if (!res?.ok || !res.gained) return res;

  showPointPop(res.gained);

  if (res.newItems?.length) {
    res.newItems.forEach(item => showUnlockToast(item));
    [document.getElementById("stackletFigure"), document.getElementById("perchedStacklet")]
      .forEach(el => { if (el) celebrateStacklet(el); });
  } else if (res.levelUp) {
    stackletReact(`Level ${res.level}! Nice.`);
    [document.getElementById("stackletFigure"), document.getElementById("perchedStacklet")]
      .forEach(el => { if (el) celebrateStacklet(el); });
  }
  loadAccessories();
  return res;
}


// ---- Stats view ----
async function loadStatsView() {
  try {
    // Time stats
    const timeRes = await sendMessage({ type: "GET_TIME_STATS", days: 7 });
    const weekTotal = document.getElementById("statWeekTotal");
    if (weekTotal) {
      if (!timeRes?.ok || !timeRes.grandTotal) {
        weekTotal.textContent = "0m";
        weekTotal.nextElementSibling.textContent = "no time tracked yet, use Stax for a bit first";
      } else {
        weekTotal.textContent = fmtMs(timeRes.grandTotal);
        document.querySelector(".stats-week-sub").textContent = "tracked this week";
      }
    }

    // Day bars
    if (timeRes?.ok) {
      const chart = document.getElementById("insightsChart");
      const totalsEl = document.getElementById("insightsTotals");
      if (chart) {
        const maxDay = Math.max(...(timeRes.perDay || []).map(d => d.total), 1);
        chart.innerHTML = "";
        (timeRes.perDay || []).forEach(d => {
          const pct = Math.round((d.total / maxDay) * 100);
          const label = new Date(d.day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
          const wrap = document.createElement("div");
          wrap.className = "insights-bar-wrap";
          wrap.title = `${label}: ${fmtMs(d.total)}`;
          wrap.innerHTML = `<div class="insights-bar" style="height:${Math.max(pct,2)}%"></div><div class="insights-bar-label">${label.slice(0,1)}</div>`;
          chart.appendChild(wrap);
        });
      }
      if (totalsEl) {
        totalsEl.innerHTML = "";
        (timeRes.totals || []).slice(0, 6).forEach(row => {
          const color = CATEGORY_COLORS[row.category] || "#b9b5ab";
          const pct = timeRes.grandTotal ? Math.round((row.ms / timeRes.grandTotal) * 100) : 0;
          const el = document.createElement("div");
          el.className = "insights-row";
          el.innerHTML = `<div class="insights-dot" style="background:${color}"></div><div class="insights-cat">${escapeHtml(row.category)}</div><div class="insights-time">${fmtMs(row.ms)} <span style="opacity:0.5;">(${pct}%)</span></div>`;
          totalsEl.appendChild(el);
        });
        if (!timeRes.totals?.length) totalsEl.innerHTML = `<div class="empty-state">Nothing tracked yet</div>`;
      }
    }

    // Right now card
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.windowId) {
      const hyg = await sendMessage({ type: "GET_HYGIENE", windowId: activeTab.windowId });
      if (hyg?.ok) {
        const pct = hyg.tabCount ? Math.round(hyg.groupedRatio * 100) : 0;
        const el = (id) => document.getElementById(id);
        if (el("statTabCount"))  el("statTabCount").textContent  = hyg.tabCount;
        if (el("statGroupCount"))el("statGroupCount").textContent= hyg.groupCount;
        if (el("statGrouped"))   el("statGrouped").textContent   = pct + "%";
        if (el("statMoodEmoji")) el("statMoodEmoji").innerHTML   = moodFace(hyg.mood, 24);
      }
    }
    loadDigest();
    loadTabTree();
  } catch (err) {
    console.warn("Stax: loadStatsView failed", err);
  }
}

// Reset stats button
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("resetStats")?.addEventListener("click", async () => {
    await sendMessage({ type: "RESET_TIME_STATS" });
    showStatus("Time stats reset.", "ok");
    loadStatsView();
  });
});

// ---- Live sync ----
// The popup used to render once on open and never again, so anything that
// changed while it was open (a tab closing, a group being renamed from the
// side panel, points earned) only appeared after a manual reload.
// These listeners keep it current. Refreshes are debounced because Chrome
// fires bursts of tab events during a sort, and re-rendering per event would
// thrash the DOM and make the list flicker.
let liveSyncTimer = null;
function scheduleLiveRefresh(reason = "") {
  clearTimeout(liveSyncTimer);
  liveSyncTimer = setTimeout(async () => {
    try {
      const dashVisible = document.getElementById("dashboardView")?.style.display !== "none";
      const statsVisible = document.getElementById("statsView")?.style.display === "block";

      // Only re-render what's actually on screen. Refreshing a hidden view
      // costs API calls for something nobody can see.
      if (dashVisible) {
        loadActiveGroups();
        refreshStatStripLive();
        refreshInboxCountsLive();
      }
      if (statsVisible) loadStatsView();
      syncStackletMood();
    } catch (err) {
      console.warn("Stax: live refresh failed", reason, err);
    }
  }, 220);
}

// These two are defined inside DOMContentLoaded, so expose thin wrappers the
// listeners above can reach from module scope.
function refreshStatStripLive() { window.__staxRefreshStrip?.(); }
function refreshInboxCountsLive() { window.__staxRefreshCounts?.(); }

function attachLiveSync() {
  // Tab and group changes
  const tabEvents = [
    chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated,
    chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached,
  ];
  tabEvents.forEach(ev => { try { ev.addListener(() => scheduleLiveRefresh("tabs")); } catch {} });

  const groupEvents = [
    chrome.tabGroups?.onCreated, chrome.tabGroups?.onRemoved,
    chrome.tabGroups?.onUpdated, chrome.tabGroups?.onMoved,
  ];
  groupEvents.forEach(ev => { try { ev?.addListener(() => scheduleLiveRefresh("groups")); } catch {} });

  // Storage changes cover everything the background worker does on its own:
  // points awarded, sessions saved, archive updated, accent changed from
  // another surface. This is what makes the side panel and popup agree.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.accent) applyAccent(changes.accent.newValue);
    if (changes.theme) {
      const v = changes.theme.newValue;
      if (v === "auto") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", v);
    }
    if (changes.stax_usage || changes.stax_accessories || changes.stackletAccessory) {
      loadAccessories();
      syncStackletMood();
    }
    if (changes.stax_sessions || changes.stax_archive) scheduleLiveRefresh("storage");
  });
}

// ---- Tutorial motion helpers ----

// Resolves once a smooth scroll has settled. Polls scrollTop and resolves
// when it stops changing, with a hard timeout so a scroll that never moves
// (target already centred) doesn't hang the step.
function waitForScrollEnd(container, timeoutMs = 700) {
  return new Promise(resolve => {
    if (!container) return resolve();
    let last = container.scrollTop;
    let stableFrames = 0;
    const started = Date.now();
    (function check() {
      const now = container.scrollTop;
      if (now === last) stableFrames++;
      else stableFrames = 0;
      last = now;
      if (stableFrames >= 3 || Date.now() - started > timeoutMs) return resolve();
      requestAnimationFrame(check);
    })();
  });
}

// Cross-fades between views instead of hard-swapping display, so tutorial
// steps that jump tabs don't flash.
async function switchViewAnimated(name) {
  const current = ["dashboardView", "stackletView", "searchView", "statsView"]
    .map(id => document.getElementById(id))
    .find(el => el && el.style.display !== "none");
  const next = document.getElementById(
    { dashboard: "dashboardView", stacklet: "stackletView", search: "searchView", stats: "statsView" }[name]
  );
  if (!next || current === next) {
    window.__staxSwitchView?.(name);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return;
  }

  if (current) {
    current.style.transition = "opacity 0.16s ease";
    current.style.opacity = "0";
    await new Promise(r => setTimeout(r, 160));
  }
  window.__staxSwitchView?.(name);
  next.style.opacity = "0";
  next.style.transition = "opacity 0.22s ease";
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  next.style.opacity = "1";
  if (current) current.style.opacity = "";
  await new Promise(r => setTimeout(r, 220));
}

// ---- Tutorial stats demo ----
// The Stats step is dead on a fresh install: no tracked time means empty
// bars and a zero total, which teaches the user nothing. This plays a short
// synthetic animation instead, then restores whatever real data exists so
// nothing the user actually accumulated is lost.
let statsDemoSaved = null;

async function playStatsDemo() {
  const totalEl = document.getElementById("statWeekTotal");
  const chart = document.getElementById("insightsChart");
  const totals = document.getElementById("insightsTotals");
  if (!totalEl || !chart) return;

  // Snapshot the real rendered markup so it can be put straight back.
  statsDemoSaved = {
    total: totalEl.textContent,
    chart: chart.innerHTML,
    totals: totals ? totals.innerHTML : "",
  };

  const demoDays = [42, 68, 35, 91, 74, 58, 80];
  const demoCats = [
    { category: "Development", ms: 4.2 * 3600000 },
    { category: "Research", ms: 2.6 * 3600000 },
    { category: "Communication", ms: 1.4 * 3600000 },
    { category: "Entertainment", ms: 0.8 * 3600000 },
  ];
  const grand = demoCats.reduce((a, c) => a + c.ms, 0);

  // Bars grow from zero, staggered left to right.
  const maxDay = Math.max(...demoDays);
  chart.innerHTML = "";
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  demoDays.forEach((v, i) => {
    const wrap = document.createElement("div");
    wrap.className = "insights-bar-wrap";
    wrap.innerHTML = `<div class="insights-bar" style="height:0%"></div><div class="insights-bar-label">${labels[i]}</div>`;
    chart.appendChild(wrap);
    setTimeout(() => {
      wrap.querySelector(".insights-bar").style.height = `${Math.round((v / maxDay) * 100)}%`;
    }, 120 + i * 90);
  });

  // Category rows fade in behind the bars.
  if (totals) {
    totals.innerHTML = "";
    demoCats.forEach((row, i) => {
      const el = document.createElement("div");
      el.className = "insights-row";
      el.style.opacity = "0";
      el.style.transition = "opacity 0.3s ease";
      const pct = Math.round((row.ms / grand) * 100);
      el.innerHTML = `<div class="insights-dot" style="background:${CATEGORY_COLORS[row.category] || "#b9b5ab"}"></div><div class="insights-cat">${row.category}</div><div class="insights-time">${fmtMs(row.ms)} <span style="opacity:0.5;">(${pct}%)</span></div>`;
      totals.appendChild(el);
      setTimeout(() => { el.style.opacity = "1"; }, 400 + i * 120);
    });
  }

  // Count the headline total up rather than snapping to it.
  await countUpTo(totalEl, grand, 1100);
}

// Eases a duration counter from zero to a target, formatted as h/m.
function countUpTo(el, targetMs, durationMs) {
  return new Promise(resolve => {
    const start = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic, so it decelerates into the final number
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmtMs(Math.round(targetMs * eased));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    })(start);
  });
}

// Puts the user's real numbers back after the demo.
function restoreStatsAfterDemo() {
  if (!statsDemoSaved) return;
  const totalEl = document.getElementById("statWeekTotal");
  const chart = document.getElementById("insightsChart");
  const totals = document.getElementById("insightsTotals");
  if (totalEl) totalEl.textContent = statsDemoSaved.total;
  if (chart) chart.innerHTML = statsDemoSaved.chart;
  if (totals) totals.innerHTML = statsDemoSaved.totals;
  statsDemoSaved = null;
  // Re-read from storage so anything that changed during the tutorial shows.
  loadStatsView();
}

// ---- Read Later search ----
// Filters client-side rather than re-querying, because the whole archive is
// already in memory and round-tripping to the worker on every keystroke
// would make typing feel laggy.
let archiveCache = [];

function renderArchiveList(items) {
  const list = document.getElementById("archiveList");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">${archiveCache.length ? "No matches" : "Nothing saved yet. Tabs close here, not into history."}</div>`;
    return;
  }
  list.innerHTML = "";
  items.slice(0, 60).forEach(entry => {
    let host = "";
    try { host = new URL(entry.url).hostname.replace(/^www\./, ""); } catch {}
    const dateStr = new Date(entry.archivedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const el = document.createElement("div");
    el.className = "archive-item";
    el.innerHTML = `
      <img class="archive-favicon" src="https://www.google.com/s2/favicons?sz=16&domain=${encodeURIComponent(host)}" onerror="this.style.display='none'">
      <span class="archive-title" title="${escapeHtml(entry.url)}">${escapeHtml(entry.title || host)}</span>
      <span class="archive-date">${dateStr}</span>
      <button class="btn-icon-small archive-delete" title="Remove">${icon("close", 11)}</button>
    `;
    el.addEventListener("click", async (e) => {
      if (e.target.closest(".archive-delete")) {
        await sendMessage({ type: "DELETE_ARCHIVED", id: entry.id });
        loadArchive();
        return;
      }
      await sendMessage({ type: "RESTORE_ARCHIVED", id: entry.id, keep: false });
      loadArchive();
    });
    list.appendChild(el);
  });
}

function wireArchiveSearch() {
  const input = document.getElementById("archiveSearch");
  if (!input || input.dataset.wired) return;
  input.dataset.wired = "1";
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return renderArchiveList(archiveCache);
    renderArchiveList(archiveCache.filter(a =>
      (a.title || "").toLowerCase().includes(q) || (a.url || "").toLowerCase().includes(q)
    ));
  });
}

// ---- Weekly digest ----
async function loadDigest() {
  const body = document.getElementById("digestBody");
  if (!body) return;
  const d = await sendMessage({ type: "GET_WEEKLY_DIGEST" });
  if (!d?.ok || !d.totalMs) {
    body.innerHTML = `<div class="empty-state">Not enough data yet. Come back after a few days of browsing.</div>`;
    return;
  }

  const lines = [];
  lines.push(`<div class="digest-line"><span class="digest-key">Total</span><span class="digest-val">${fmtMs(d.totalMs)}</span></div>`);
  if (d.topCategory) {
    lines.push(`<div class="digest-line"><span class="digest-key">Most time in</span><span class="digest-val">${escapeHtml(d.topCategory)}</span></div>`);
  }
  if (d.busiestDay) {
    const day = new Date(d.busiestDay + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
    lines.push(`<div class="digest-line"><span class="digest-key">Busiest day</span><span class="digest-val">${day} (${fmtMs(d.busiestMs)})</span></div>`);
  }
  // Trend is only meaningful with a full week behind it; the backend returns
  // null rather than a misleading percentage when it isn't.
  if (d.trend != null) {
    const cls = Math.abs(d.trend) < 8 ? "digest-trend-flat" : d.trend > 0 ? "digest-trend-up" : "digest-trend-down";
    const label = Math.abs(d.trend) < 8 ? "about the same" : `${d.trend > 0 ? "up" : "down"} ${Math.abs(d.trend)}%`;
    lines.push(`<div class="digest-line"><span class="digest-key">Second half of week</span><span class="${cls}">${label}</span></div>`);
  }
  if (d.archivedThisWeek) {
    lines.push(`<div class="digest-line"><span class="digest-key">Archived</span><span class="digest-val">${d.archivedThisWeek} page(s)</span></div>`);
  }
  if (d.sessionsThisWeek) {
    lines.push(`<div class="digest-line"><span class="digest-key">Sessions saved</span><span class="digest-val">${d.sessionsThisWeek}</span></div>`);
  }
  lines.push(`<div class="digest-line"><span class="digest-key">Stacklet</span><span class="digest-val">Level ${d.level}, ${d.points} pts</span></div>`);
  body.innerHTML = lines.join("");
}

// ---- Tab tree ----
async function loadTabTree() {
  const container = document.getElementById("tabTree");
  const meta = document.getElementById("treeMeta");
  if (!container) return;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.windowId) return;
  const res = await sendMessage({ type: "GET_TAB_TREE", windowId: activeTab.windowId });
  if (!res?.ok) return;

  if (meta) meta.textContent = res.branching ? `${res.branching} trail(s), ${res.maxDepth} deep` : "";

  // Only trails worth looking at: a flat list of roots with no children is
  // just the tab bar again.
  const branching = res.roots.filter(r => r.children.length > 0);
  if (!branching.length) {
    container.innerHTML = `<div class="empty-state">No branching tabs. Open a few links from a page and they'll show up here.</div>`;
    return;
  }

  container.innerHTML = "";
  const MAX_DEPTH = 3;

  function render(node, depth) {
    if (depth > MAX_DEPTH) return;
    const el = document.createElement("div");
    el.className = "tree-node";
    el.dataset.depth = String(depth);
    el.innerHTML = `
      <span class="tree-branch">${depth === 0 ? "" : "&#9492;"}</span>
      <span class="tree-title">${escapeHtml(node.title)}</span>
      <span class="tree-host">${escapeHtml(node.host)}</span>
    `;
    el.addEventListener("click", () => sendMessage({ type: "JUMP_TO_TAB", tabId: node.id }));
    container.appendChild(el);

    if (depth === MAX_DEPTH && node.children.length) {
      // Say how much is hidden rather than truncating silently.
      const deeper = document.createElement("div");
      deeper.className = "tree-more";
      deeper.textContent = `+${node.children.length} deeper`;
      container.appendChild(deeper);
      return;
    }
    node.children.forEach(c => render(c, depth + 1));
  }

  branching.forEach(r => render(r, 0));
}

// ---- Suggested rules ----
// Surfaced in Settings, above the manual rule editor, since that's where
// someone goes when they're thinking about rules anyway.
async function loadSuggestedRules() {
  const host = document.getElementById("suggestedRules");
  if (!host) return;
  const res = await sendMessage({ type: "GET_SUGGESTED_RULES" });
  const list = res?.suggestions || [];
  if (!list.length) { host.innerHTML = ""; return; }

  host.innerHTML = "";
  list.forEach(s => {
    const card = document.createElement("div");
    card.className = "suggest-card";
    card.innerHTML = `
      <div class="suggest-text">
        You've grouped <span class="suggest-domains">${s.domains.map(escapeHtml).join("</span> and <span class=\"suggest-domains\">")}</span>
        together ${s.count} times. Make it automatic?
      </div>
      <div class="suggest-btns">
        <button class="btn btn-secondary suggest-no">No thanks</button>
        <button class="btn btn-primary suggest-yes">Add rule</button>
      </div>
    `;
    card.querySelector(".suggest-yes").addEventListener("click", async () => {
      await sendMessage({ type: "ACCEPT_SUGGESTED_RULE", domains: s.domains, name: s.name });
      showStatus(`Rule added: ${s.name}`, "ok");
      card.remove();
      loadSuggestedRules();
    });
    card.querySelector(".suggest-no").addEventListener("click", async () => {
      await sendMessage({ type: "DISMISS_SUGGESTED_RULE", domains: s.domains });
      card.remove();
    });
    host.appendChild(card);
  });
}