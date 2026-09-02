// Supabase Configuration (Anonymous telemetry logging)
const SUPABASE_URL = "https://YOUR_SUPABASE_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const I18N = {
  en: {
    subTitle: "Smart Tab Engine",
    quickSort: "⚡ Quick Sort (Local)",
    dedupe: "🧹 Close Duplicates",
    testTabs: "🚀 Open Test Tab Set",
    settings: "⚙️ API Key & Settings"
  },
  de: {
    subTitle: "Intelligente Tab-Verwaltung",
    quickSort: "⚡ Schnell-Sortierung (Lokal)",
    dedupe: "🧹 Duplikate Schließen",
    testTabs: "🚀 Test-Tabs Öffnen",
    settings: "⚙️ API Key & Einstellungen"
  }
};

async function getOrCreateBrowserId() {
  const { browserId } = await chrome.storage.local.get("browserId");
  if (browserId) return browserId;
  
  const newId = "stax_usr_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  await chrome.storage.local.set({ browserId: newId });
  return newId;
}

async function sendAnonymousReport(payload) {
  if (SUPABASE_URL.includes("YOUR_SUPABASE")) return; // Skip if keys aren't replaced
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/telemetry`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.log("Telemetry skipped:", e);
  }
}

function applyTranslations(lang) {
  const dict = I18N[lang] || I18N.en;
  document.getElementById("subTitleText").textContent = dict.subTitle;
  document.getElementById("quickSort").textContent = dict.quickSort;
  document.getElementById("dedupe").textContent = dict.dedupe;
  document.getElementById("openTestTabs").textContent = dict.testTabs;
  document.getElementById("settingsLink").textContent = dict.settings;
}

document.addEventListener("DOMContentLoaded", async () => {
  const { onboarded, userLang } = await chrome.storage.local.get(["onboarded", "userLang"]);
  const onboardScreen = document.getElementById("onboardingScreen");
  const mainScreen = document.getElementById("mainScreen");

  if (!onboarded) {
    onboardScreen.style.display = "block";
    mainScreen.style.display = "none";
  } else {
    onboardScreen.style.display = "none";
    mainScreen.style.display = "block";
    applyTranslations(userLang || "en");
  }

  document.getElementById("saveOnboarding")?.addEventListener("click", async () => {
    const lang = document.getElementById("initLang").value;
    const role = document.getElementById("initRole").value;
    const source = document.getElementById("initSource").value;
    const browserId = await getOrCreateBrowserId();

    await chrome.storage.local.set({ onboarded: true, userLang: lang, userRole: role });

    // Send zero-PII telemetry payload
    sendAnonymousReport({
      browser_id: browserId,
      language: lang,
      role: role,
      source: source,
      created_at: new Date().toISOString()
    });

    applyTranslations(lang);
    onboardScreen.style.display = "none";
    mainScreen.style.display = "block";
  });

  document.getElementById("quickSort")?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) chrome.runtime.sendMessage({ type: "LOCAL_SORT", windowId: tab.windowId });
  });

  document.getElementById("dedupe")?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      chrome.runtime.sendMessage({ type: "REMOVE_DUPLICATES", windowId: tab.windowId }, (res) => {
        const dedupeBtn = document.getElementById("dedupe");
        if (res?.ok) {
          dedupeBtn.textContent = `✓ ${res.removed}`;
          setTimeout(() => applyTranslations(lang), 2000);
        }
      });
    }
  });

  document.getElementById("openTestTabs")?.addEventListener("click", () => {
    const urls = ["https://github.com", "https://github.com", "https://wikipedia.org", "https://paypal.com", "https://youtube.com"];
    urls.forEach((url) => chrome.tabs.create({ url, active: false }));
  });
});