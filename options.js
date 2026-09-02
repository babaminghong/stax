const providerSelect = document.getElementById("provider");
const anthropicFields = document.getElementById("anthropicFields");
const geminiFields = document.getElementById("geminiFields");
const keyInput = document.getElementById("key");
const geminiKeyInput = document.getElementById("geminiKey");
const geminiModelInput = document.getElementById("geminiModel");
const msg = document.getElementById("msg");

function syncVisibility() {
  const isGemini = providerSelect.value === "gemini";
  if (anthropicFields) anthropicFields.style.display = isGemini ? "none" : "block";
  if (geminiFields) geminiFields.style.display = isGemini ? "block" : "none";
}

if (providerSelect) {
  providerSelect.addEventListener("change", syncVisibility);
}

(async function init() {
  const { provider = "anthropic", anthropicApiKey, geminiApiKey, geminiModel } =
    await chrome.storage.local.get(["provider", "anthropicApiKey", "geminiApiKey", "geminiModel"]);

  if (providerSelect) providerSelect.value = provider;
  if (anthropicApiKey && keyInput) keyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
  if (geminiApiKey && geminiKeyInput) geminiKeyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
  if (geminiModelInput) geminiModelInput.value = geminiModel || "gemini-flash-latest";
  syncVisibility();
})();

const saveBtn = document.getElementById("save");
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    const provider = providerSelect.value;
    const updates = { provider };

    if (provider === "anthropic") {
      const value = keyInput.value.trim();
      if (value) {
        if (!value.startsWith("sk-ant-")) {
          msg.textContent = "That doesn't look like an Anthropic key (should start with sk-ant-).";
          msg.className = "err";
          return;
        }
        updates.anthropicApiKey = value;
      }
    } else {
      const value = geminiKeyInput.value.trim();
      if (value) updates.geminiApiKey = value;
      if (geminiModelInput) updates.geminiModel = geminiModelInput.value.trim() || "gemini-flash-latest";
    }

    await chrome.storage.local.set(updates);
    if (keyInput) keyInput.value = "";
    if (geminiKeyInput) geminiKeyInput.value = "";
    if (updates.anthropicApiKey && keyInput) keyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
    if (updates.geminiApiKey && geminiKeyInput) geminiKeyInput.placeholder = "Key saved (hidden) — enter a new one to replace it";
    if (msg) {
      msg.textContent = "Saved.";
      msg.className = "ok";
    }
  });
}

const clearBtn = document.getElementById("clear");
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove(["anthropicApiKey", "geminiApiKey"]);
    if (keyInput) keyInput.placeholder = "sk-ant-…";
    if (geminiKeyInput) geminiKeyInput.placeholder = "AIza…";
    if (msg) {
      msg.textContent = "Keys removed.";
      msg.className = "ok";
    }
  });
}