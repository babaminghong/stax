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
        showStatus(`Created ${res.groupsCreated} group(s)${suffix}.`, "ok");
        if (res.groupsCreated > 0) showUndoBanner("Sort made some changes.");
      } else {
        showStatus("Sort failed, try again.", "error");
      }
      loadActiveGroups();
    });
    btn.disabled = false;
  });

  document.getElementById("aiSort")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="ai-spark">✨</span>&nbsp;Thinking…`;
    await withCurrentWindow(async (windowId) => {
      const res = await sendMessage({ type: "AI_SORT", windowId });
      if (!res) {
        showStatus("No response from background worker.", "error");
      } else if (res.ok) {
        showStatus(`AI created ${res.groupsCreated} group(s).`, "ok");
        if (res.groupsCreated > 0) showUndoBanner("AI sort made some changes.");
      } else if (res.error === "no-key") {
        showStatus("No API key set. Open Settings to add one.", "error");
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
      if (res.removed > 0) showUndoBanner("Closed some duplicate tabs.");
    }
    loadActiveGroups();
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
      showStatus("Nothing left to undo.", "error");
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

  // ---- View switching. Dashboard, Stacklet, and Find are views inside the
  // main screen rather than separate pages, so the header and tabs stay put
  // instead of the whole popup swapping out from under you.
  const views = {
    dashboard: document.getElementById("dashboardView"),
    stacklet: document.getElementById("stackletView"),
    search: document.getElementById("searchView")
  };
  const navTabs = document.getElementById("navTabs");

  function switchView(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.style.display = key === name ? "block" : "none";
    });
    navTabs?.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    if (name === "stacklet") initStacklet();
    if (name === "search") openPaletteScreen();
  }
  window.__staxSwitchView = switchView;

  navTabs?.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  // Perched Stacklet in the header: same character, same sleep/wake rules.
  const perched = document.getElementById("perchedStacklet");
  if (perched) {
    perched.innerHTML = stackletSvg();
    perched.addEventListener("click", () => {
      if (perched.classList.contains("sleeping")) wakeStacklet(perched);
      else {
        // Already awake, so a poke just sends him to his own tab.
        switchView("stacklet");
      }
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
  clearTimeout(showUndoBanner._t);
  // Undo only stays useful for a couple minutes server-side (see
  // UNDO_WINDOW_MS in background.js), hide the banner well before that
  // window closes so it never invites a click that's already too late.
  showUndoBanner._t = setTimeout(hideUndoBanner, 8000);
}

function hideUndoBanner() {
  const banner = document.getElementById("undoBanner");
  if (banner) banner.style.display = "none";
}

// ---- Saved sessions ----
async function loadSessions() {
  const list = document.getElementById("sessionsList");
  if (!list) return;
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
        <span class="group-badge group-badge-grey">📁</span>
        <span class="group-name">${escapeHtml(s.name)}</span>
        <span class="group-count">${s.tabCount}</span>
      </div>
      <div style="display:flex; gap: 4px; flex-shrink: 0;">
        <button class="btn-icon-small session-restore" title="Reopen (saved ${dateStr})">↩</button>
        <button class="btn-icon-small session-delete" title="Delete">✕</button>
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
    aiBtn.innerHTML = `<span class="ai-spark">✨</span>&nbsp;Asking AI…`;
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
    nextBtn.textContent = current === steps.length - 1 ? "Get Started 🚀" : "Continue";
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
      <button class="btn-icon-small" title="Ungroup" data-group-id="${g.id}">✕</button>
    `;
    item.querySelector("button").addEventListener("click", async (e) => {
      const groupId = Number(e.currentTarget.dataset.groupId);
      await sendMessage({ type: "UNGROUP_ONE", groupId });
      loadActiveGroups();
    });
    groupsList.appendChild(item);
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

  for (const action of res.actions || []) {
    if (res.autoRun) {
      // Auto-run is opt-in and off by default. Even here the result is
      // reported in the log rather than happening silently, so there's
      // always a visible trail of what Stacklet did on its own.
      const runRes = await sendMessage({ type: "STACKLET_RUN_ACTION", action, windowId });
      appendChatMessage(
        runRes?.ok ? `✓ ${action.label}, ${runRes.detail || "done"}` : `✗ Couldn't run: ${action.label}`,
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

// Keeps the bubble beside him instead of pinned to the left edge, and stops
// it running off the right side when he's walked far over.
function positionBubble() {
  const bubble = document.getElementById("stackletBubble");
  const stage = document.getElementById("stackletStage");
  if (!bubble || !stage) return;
  const maxLeft = Math.max(0, stage.clientWidth - bubble.offsetWidth - 4);
  bubble.style.left = `${Math.min(stackletX, maxLeft)}px`;
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
  positionBubble(); // width changed as it typed, so re-clamp against the edge
  clearTimeout(stackletSay._t);
  stackletSay._t = setTimeout(() => bubble.classList.remove("show"), hold);
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
const TUTORIAL_STEPS = [
  {
    target: null,
    text: "Hi, I'm Stacklet! I live up on the logo. Let me show you around, it only takes a minute."
  },
  {
    target: "navTabs",
    text: "These three tabs are the whole app. Tabs is your dashboard, Stacklet is me, and Find jumps you to any open tab."
  },
  {
    target: "quickSort",
    text: "Smart Sort is the main one. It sorts every open tab into colour-coded groups using local rules, instantly and offline."
  },
  {
    target: "dedupe",
    text: "Close Duplicates clears out repeated tabs across every window. If it closes something you wanted, Undo brings it straight back."
  },
  {
    target: "suspendInactive",
    text: "Suspend Inactive frees the memory used by tabs you haven't touched in a while. They reload the moment you click back in."
  },
  {
    target: "saveSessionBtn",
    text: "Save Session snapshots your tabs and their groups. Close everything, then reopen the whole set later, even after a restart."
  },
  {
    target: "activeGroupsList",
    text: "Your live groups show up here. The side panel gives you the same list plus rename, collapse, and move-to-new-window."
  },
  {
    target: "openSettings",
    text: "Settings holds your colour theme, custom domain rules, and your API key. That's everything, go make a mess of some tabs."
  }
];

let tutorialIndex = 0;

function positionSpotlight(targetId) {
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

  // Only scroll when the target is genuinely off-screen, and scroll
  // instantly. The previous version always smooth-scrolled and then measured
  // in the same tick, so the rect was read *before* the scroll finished and
  // every highlight landed at stale coordinates. For anything already in
  // view (the header gear on the last step) scrolling also dragged the whole
  // layout sideways under the spotlight.
  const pre = el.getBoundingClientRect();
  const fullyVisible = pre.top >= 0 && pre.bottom <= window.innerHeight;
  if (!fullyVisible) el.scrollIntoView({ block: "center", behavior: "auto" });

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

  countEl.textContent = `STEP ${tutorialIndex + 1} OF ${TUTORIAL_STEPS.length}`;
  backBtn.style.visibility = tutorialIndex === 0 ? "hidden" : "visible";
  nextBtn.textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next";
  renderTutorialPips();

  // Set the full text before positioning so the card is measured at its
  // final height. Positioning against an empty (short) card meant a long
  // step could grow downward afterwards and cover its own target.
  textEl.textContent = step.text;
  positionSpotlight(step.target);
  await typeInto(textEl, step.text, 16);
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
  await renderTutorialStep();
}

function endTutorial() {
  document.getElementById("tutorialOverlay")?.classList.remove("show");
  chrome.storage.sync.set({ tutorialDone: true });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("tutorialNext")?.addEventListener("click", async () => {
    if (tutorialIndex >= TUTORIAL_STEPS.length - 1) {
      endTutorial();
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