# Stax — Intelligent Tab Management Engine

[English](#stax--intelligent-tab-management-engine) | [Deutsch](#deutsch)

> Stax turns browser tab chaos into organized, color-coded tab groups — mostly automatically, with zero setup required.

---

## The Problem

40 tabs open, jumping between code docs, Spotify, YouTube, and online banking, and you've completely lost track of where anything is. Manually grouping tabs takes more effort than it's worth, so they just pile up until the tab bar is unreadable.

## 3 Key QoL Improvements

1. **Hybrid sort instead of two disconnected engines.** Local domain rules used to run separately from AI grouping — anything the local rules couldn't place just sat ungrouped even with an API key configured. Smart Sort now runs local rules first (instant, free, works offline) and only hands the leftover tabs to AI, so you get the speed of local sorting with AI covering the long tail instead of either/or.
2. **Auto-sort on new tab actually works now.** The toggle existed in Preferences before, but it wrote a value to storage that nothing ever read — flipping it did nothing. It's now wired to a real local sort, debounced per window, so opening a batch of tabs (restoring a session, following a link) triggers one sort instead of firing on every single tab.
3. **Settings and live group management moved into the popup and side panel.** No more opening a separate options page in a new tab to change a setting. Everything lives inside the popup now, and the side panel mirrors it with live updates via Chrome's tab-group events, so you can watch groups change in real time without a manual refresh.

## How it actually sorts tabs

Local rules check exact registrable domains first (a proper allow-list, not a substring match — `amazon.com.evil.ru` can never match `amazon.com`), then fall back to a small multilingual keyword classifier for anything unlisted, then group any remaining cluster of tabs by shared hostname. AI (Claude or Gemini, your own API key) only gets called on whatever's left after all of that — it's a bonus for the long tail, not something the tool depends on to be useful out of the box.

---

## Tech Stack

* Manifest V3 extension architecture
* Vanilla ES6+ JavaScript, no build step
* Chrome `storage.sync` / `storage.local` for settings and API keys — nothing leaves your machine except direct calls to whichever AI provider you configure

---

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/babaminghong/stax.git
   ```
2. Open `chrome://extensions` in Chrome (or the equivalent page in Brave/Edge).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the cloned `stax` folder.
5. Pin the Stax icon to your toolbar and open it — the onboarding wizard walks you through the rest.

Optional: to use AI Context Grouping, open Stax's Settings and add an Anthropic or Gemini API key. Everything works without one; it just falls back to local rules only.

---

## Deutsch

> Stax verwandelt Browser-Tab-Chaos automatisch in strukturierte, farbcodierte Tab-Gruppen — größtenteils ohne Einrichtung.

### Das Problem

40 offene Tabs, ständiges Wechseln zwischen Doku, Musik, YouTube und Online-Banking, und man verliert komplett den Überblick. Manuelles Gruppieren lohnt sich nicht, also bleiben die Tabs einfach liegen.

### Die 3 wichtigsten QoL-Verbesserungen

1. **Hybrid-Sortierung statt zweier getrennter Engines.** Lokale Regeln laufen jetzt zuerst, KI übernimmt nur noch die übrig gebliebenen Tabs — vorher blieben Tabs liegen, die die lokalen Regeln nicht zuordnen konnten, selbst mit gesetztem API-Key.
2. **Auto-Sortierung bei neuem Tab funktioniert jetzt wirklich.** Der Schalter existierte vorher nur kosmetisch. Jetzt löst er eine echte, pro Fenster entprellte lokale Sortierung aus.
3. **Einstellungen und Live-Gruppenverwaltung im Popup und Seitenpanel.** Keine separate Optionsseite mehr — alles läuft im Popup, und das Seitenpanel zeigt Änderungen in Echtzeit.