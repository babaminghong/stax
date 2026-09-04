const providerSelect = document.getElementById("provider");
const anthropicFields = document.getElementById("anthropicFields");
const geminiFields = document.getElementById("geminiFields");
const keyInput = document.getElementById("key");
const geminiKeyInput = document.getElementById("geminiKey");
const geminiModelInput = document.getElementById("geminiModel");
const msg = document.getElementById("msg");
const rulesList = document.getElementById("rulesList");
const COLORS = ["blue", "purple", "green", "yellow", "pink", "cyan", "orange", "red", "grey"];

(async function applyThemeEarly() {
  const { theme = "auto" } = await chrome.storage.sync.get(["theme"]);
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
})();


function syncVisibility() {
  const isGemini = providerSelect.value === "gemini";
  if (anthropicFields) anthropicFields.style.display = isGemini ? "none" : "block";
  if (geminiFields) geminiFields.style.display = isGemini ? "block" : "none";
}

if (providerSelect) providerSelect.addEventListener("change", syncVisibility);

function colorOptionsHtml(selected) {
  return COLORS.map(c => `<option value="${c}" ${c === selected ? "selected" : ""}>${c[0].toUpperCase() + c.slice(1)}</option>`).join("");
}

function addRuleRow(rule = { domains: "", name: "", color: "blue" }) {
  const row = document.createElement("div");
  row.className = "rule-row";
  row.innerHTML = `
    <input type="text" class="text-input rule-domains" placeholder="Domains (e.g. jira.com, github.com)" value="${escapeAttr(rule.domains)}" />
    <input type="text" class="text-input rule-name" placeholder="Group Name" value="${escapeAttr(rule.name)}" />
    <select class="select-input rule-color">${colorOptionsHtml(rule.color)}</select>
    <button type="button" class="rule-remove" title="Remove rule">✕</button>
  `;
  row.querySelector(".rule-remove").addEventListener("click", () => row.remove());
  rulesList.appendChild(row);
}

function escapeAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

function readRulesFromForm() {
  const rows = rulesList.querySelectorAll(".rule-row");
  const rules = [];
  rows.forEach(row => {
    const domainsRaw = row.querySelector(".rule-domains").value.trim();
    const name = row.querySelector(".rule-name").value.trim();
    const color = row.querySelector(".rule-color").value;
    const domains = domainsRaw
      .split(",")
      .map(d => d.trim().toLowerCase())
      .filter(Boolean);
    if (name && domains.length) rules.push({ name, domains, color });
  });
  return rules;
}

document.getElementById("addRule")?.addEventListener("click", () => addRuleRow());

(async function init() {
  const { provider = "anthropic", anthropicApiKey, geminiApiKey, geminiModel } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey", "geminiModel"]);
  const { customRules = [] } = await chrome.storage.sync.get(["customRules"]);

  if (providerSelect) providerSelect.value = provider;
  if (anthropicApiKey && keyInput) keyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
  if (geminiApiKey && geminiKeyInput) geminiKeyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
  if (geminiModelInput) geminiModelInput.value = geminiModel || "gemini-flash-latest";
  syncVisibility();

  if (customRules.length) {
    customRules.forEach(r => addRuleRow({ domains: (r.domains || []).join(", "), name: r.name, color: r.color || "blue" }));
  } else {
    addRuleRow({ domains: "jira.atlassian.com, github.com", name: "Work", color: "blue" });
  }
})();

function showMsg(text, kind) {
  if (!msg) return;
  msg.textContent = text;
  msg.className = `msg-line ${kind}`;
}

document.getElementById("saveOptions")?.addEventListener("click", async () => {
  const provider = providerSelect.value;
  const localUpdates = { provider };

  if (provider === "anthropic") {
    const value = keyInput.value.trim();
    if (value) {
      if (!value.startsWith("sk-ant-")) {
        showMsg("That doesn't look like an Anthropic key (should start with sk-ant-).", "err");
        return;
      }
      localUpdates.anthropicApiKey = value;
    }
  } else {
    const value = geminiKeyInput.value.trim();
    if (value) localUpdates.geminiApiKey = value;
    if (geminiModelInput) localUpdates.geminiModel = geminiModelInput.value.trim() || "gemini-flash-latest";
  }

  const customRules = readRulesFromForm();

  await chrome.storage.local.set(localUpdates);
  await chrome.storage.sync.set({ customRules });

  if (keyInput) keyInput.value = "";
  if (geminiKeyInput) geminiKeyInput.value = "";
  if (localUpdates.anthropicApiKey && keyInput) keyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
  if (localUpdates.geminiApiKey && geminiKeyInput) geminiKeyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";

  showMsg("Saved.", "ok");
});

document.getElementById("clear")?.addEventListener("click", async () => {
  await chrome.storage.local.remove(["anthropicApiKey", "geminiApiKey"]);
  if (keyInput) keyInput.placeholder = "sk-ant-…";
  if (geminiKeyInput) geminiKeyInput.placeholder = "AIza…";
  showMsg("Keys removed.", "ok");
});