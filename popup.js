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

function friendlyAiError(rawError) {
  const msg = rawError || "AI grouping failed.";
  if (/\b503\b/.test(msg) || /UNAVAILABLE/i.test(msg)) {
    return "The AI model is overloaded right now — already retried a few times. Try again shortly.";
  }
  if (/\b529\b/.test(msg) || /overloaded/i.test(msg)) {
    return "Claude is overloaded right now — already retried a few times. Try again shortly.";
  }
  if (/\b401\b/.test(msg) || /\b403\b/.test(msg)) {
    return "That API key was rejected — check it in Settings.";
  }
  if (/\b429\b/.test(msg)) {
    return "Rate limited — you've hit the request cap for now. Try again in a bit.";
  }
  return msg;
}

function glyphFor(name) {
  return CATEGORY_GLYPHS[name] || (name || "?").slice(0, 2).toUpperCase();
}

// Applied as early as possible (before anything paints) to avoid a
// light-then-dark flash when the saved theme differs from the OS setting.
(async function applyThemeEarly() {
  const { theme = "auto" } = await chrome.storage.sync.get(["theme"]);
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
})();

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
    // First-run only: play the splash draw-on animation, then reveal the
    // wizard underneath once it's finished (skips instantly if the person
    // has reduced-motion set, since the CSS just hides the splash then).
    mainScreen.style.display = "none";
    settingsScreen.style.display = "none";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onboardScreen.style.display = "block";
      initOnboardingWizard(onboardScreen, mainScreen, settingsScreen);
    } else {
      splashScreen.style.display = "flex";
      onboardScreen.style.display = "none";
      setTimeout(() => {
        splashScreen.style.display = "none";
        onboardScreen.style.display = "block";
        initOnboardingWizard(onboardScreen, mainScreen, settingsScreen);
      }, 1900);
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

  // Settings now lives entirely inside the popup — no separate window/tab.
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
      } else {
        showStatus("Sort failed — try again.", "error");
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
    if (res?.ok) showStatus(`Closed ${res.removed} duplicate tab(s).`, "ok");
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
});

async function withCurrentWindow(fn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) await fn(tab.windowId);
}

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

// ---- Onboarding wizard: click-to-select chips, single or multi per step ----
function initOnboardingWizard(onboardScreen, mainScreen, settingsScreen) {
  const steps = Array.from(onboardScreen.querySelectorAll(".wizard-step"));
  const dots = Array.from(onboardScreen.querySelectorAll(".wizard-dot"));
  const backBtn = document.getElementById("wizardBack");
  const nextBtn = document.getElementById("wizardNext");
  const hint = document.getElementById("wizardHint");
  const answers = { role: null, tabHabit: null, useCases: [], aiInterest: null };
  let current = 0;

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
      ? "Tap all the ones that fit — you can change these later in Settings."
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
    // Last step — save everything and hand off to the main dashboard.
    // These are preferences, not secrets, so they sync across devices —
    // only API keys stay in .local (see the note in Settings).
    await chrome.storage.sync.set({
      onboarded: true,
      userRole: answers.role,
      tabHabit: answers.tabHabit,
      useCases: answers.useCases,
      aiInterest: answers.aiInterest
    });
    onboardScreen.style.display = "none";
    mainScreen.style.display = "block";
    loadActiveGroups();
    if (answers.aiInterest === "yes") {
      // Straight into the in-popup Settings screen — no separate window.
      mainScreen.style.display = "none";
      settingsScreen.style.display = "block";
      initSettingsScreen();
      const settingsMsg = document.getElementById("settingsMsg");
      if (settingsMsg) { settingsMsg.textContent = "Add your API key below to enable AI grouping."; settingsMsg.className = "wizard-hint"; }
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Settings screen (provider/keys/custom rules) — lives entirely in the
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
  if (anthropicApiKey) keyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
  if (geminiApiKey) geminiKeyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
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
    // custom rules can blow through that, and the old code never checked —
    // it just told you "Saved." either way even if the write silently failed.
    try {
      await chrome.storage.local.set(localUpdates);
      await chrome.storage.sync.set({ customRules });
    } catch (err) {
      console.warn("Stax: failed to save settings", err);
      settingsMsg.style.color = "var(--chip-red-ink)";
      settingsMsg.textContent = "Couldn't save — you may have too many custom rules for sync storage. Try removing one.";
      return;
    }

    keyInput.value = "";
    geminiKeyInput.value = "";
    if (localUpdates.anthropicApiKey) keyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
    if (localUpdates.geminiApiKey) geminiKeyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";

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