# Stax v1.4.0

> **The Intelligent, Privacy-First Tab Manager & AI Browsing Companion for Chrome & Firefox.**

Stax transforms browser tab chaos into structured, productive workspaces. Built on **Manifest V3**, Stax combines lightning-fast local pattern rules with optional **Anthropic (Claude)** and **Google Gemini** AI power to organize tabs, reduce memory usage, track browsing habits, and maintain focus—all while keeping your data strictly on your device.

---

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Browsers](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Firefox%20%7C%20Edge%20%7C%20Brave-orange.svg)](#-installation)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local-green.svg)](#-privacy--security)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

##  Why Stax? That's the question you may ask yourself now.. 

Modern browsing means dozens of open tabs scattered across multiple windows. Standard tab managers either require manual sorting or compromise your privacy by sending full page content to remote servers.

**Stax is built differently:**
* **Instant & Offline First:** Over 90% of your tabs are categorized instantly using built-in TLD, hostname, path, and title clustering rules—no network requests required.
* **Hybrid AI Engine:** Unsure of a tab? Stax optionally calls Claude or Gemini using *only* tab metadata (title & domain)—never page contents, cookies, or form data.
* **Resource Optimization:** Free up gigabytes of RAM by automatically suspending or archiving inactive tabs without losing your place.
* **Companion Assistant (Stacklet):** Chat with your browser assistant to perform multi-step tab actions, research topics, or clean up clutter via natural language.

---

##  Key Features

###  1. Hybrid Tab Categorization & Smart Sorting
* **Built-in Rule Categories:** Automatically groups tabs into standard categories like *AI & ML*, *Development*, *Social & Media*, *Productivity*, *Communication*, *Finance*, *Shopping*, *Entertainment*, *News*, and *Travel*.
* **Structural Pattern Classifier:** Identifies domains by TLDs (`.dev`, `.shop`, `.bank`), URL path structures (`/cart`, `/checkout`, `/pull`), and hostname tokens.
* **Smart Cluster Naming:** Fallback groups intelligently extract shared context across tab titles (e.g., naming a group *"React Router"* instead of raw hostnames).
* **AI Fallback:** Uses Anthropic Sonnet or Gemini Flash to categorize edge-case tabs into clean, color-coded groups.

###  2. Smart URL Normalization & Deduplication
* **Param Stripping:** Strips tracking junk (`utm_source`, `fbclid`, `gclid`, `ref`, etc.) to match identical pages opened from different sources.
* **Canonical Matching:** Ignores trailing slashes, fragments (`#`), and URL parameter reordering.
* **Focus Protection:** Keeps the oldest open tab during deduplication to prevent focus jumps.

###  3. Stacklet — AI Browsing Companion
* **Context-Aware Assistance:** Tailors recommendations based on user profiles (*Developer*, *Marketing*, *Research*, *Design*, *General*).
* **Safe Action Execution:** Proposes actions with interactive confirmation cards (`group_tabs`, `close_tabs`, `suspend_tabs`, `rename_group`, `save_session`, `open_tabs`).
* **Safe Tab Opening:** Can research and open curated sets of verified HTTP/HTTPS links without breaking context.

###  4. Tab Tree Lineage & Hierarchy
* Reconstructs parent-child relationship trees using browser `openerTabId` history.
* Easily follow research trails and see where child tabs originated.

###  5. Memory Saver & Inactive Tab Suspension
* Automatically discards inactive tabs (>20 minutes idle) to free memory.
* Preserves tab position and title—clicking any suspended tab immediately restores it.

###  6. Focus Mode
* Keeps your active task front-and-center while collapsing all other tab groups.
* Optionally suspends non-active tab groups during deep work sessions and restores your workspace state on exit.

###  7. Sessions & Read-Later Archive
* **Session Snapshots:** Save named snapshots of window tab states (including group colors and names) to reopen later or across browser restarts.
* **Stale Tab Auto-Archiving:** Automatically close tabs inactive for extended periods (e.g., >7 days) into a local Read-Later archive without losing URLs.

###  8. Natural Language Tab Search
* Search your tab stack using natural language queries like *"Where was I looking at flight status?"* or *"Find the PR review tab"*.

###  9. Local Privacy-First Time Tracking
* Tracks time spent across categories locally.
* Includes guards against micro-switches and machine sleep cycles. Data auto-prunes after 21 days.

###  10. One-Click Markdown Export
* Export your entire window's tab structure formatted neatly as a Markdown document for notes, summaries, or team sharing.

###  11. Tab Hygiene & Gamification
* Track your **Tab Hygiene Score** and Stacklet's mood.
* Earn points for organizing, saving memory, and keeping tab clutter low to unlock fun companion accessories!

---

##  How It Works Architecture

Stax uses a multi-tier classification pipeline designed for maximum speed and zero data leakage:

```text
[ Incoming Tab ]
       │
       ▼
┌───────────────────────────┐
│  Tier 1: Local Rules      │ ── (Match: Custom / Built-in Domain List) ──► [ Group Created ]
└─────────────┬─────────────┘
              │ (No match)
              ▼
┌───────────────────────────┐
│  Tier 2: Pattern Signals  │ ── (Match: TLD / Host / Path / Title)     ──► [ Group Created ]
└─────────────┬─────────────┘
              │ (No match)
              ▼
┌───────────────────────────┐
│  Tier 3: Smart Clustering │ ── (Match: Shared Title Tokens)           ──► [ Group Created ]
└─────────────┬─────────────┘
              │ (Leftover Tabs & AI Enabled)
              ▼
┌───────────────────────────┐
│  Tier 4: Metadata AI      │ ── (Claude / Gemini JSON Batching)         ──► [ Group Created ]
└───────────────────────────┘
```

---

## ⌨ Keyboard Shortcuts

Stax includes built-in keyboard command triggers (customizable via `chrome://extensions/shortcuts` or `about:addons`):

| Command | Default Trigger | Action Description |
| :--- | :--- | :--- |
| `quick-sort` | `Alt + Shift + S` | Run Hybrid Smart Sort on current window |
| `quick-find` | `Alt + Shift + F` | Open natural language tab search |
| `toggle-focus` | `Alt + Shift + Z` | Toggle Focus Mode (collapse background groups) |
| `dedupe-tabs` | `Alt + Shift + D` | Deduplicate tabs across windows |
| `suspend-inactive` | — | Suspend tabs inactive for >20 mins |
| `save-session` | — | Snapshot current window tabs and groups |
| `archive-stale` | — | Move inactive tabs (>7 days) to Read-Later archive |
| `undo-last` | `Ctrl + Shift + Z` | Undo last sort or tab closure action |

---

##  Installation & Setup

### 1. Developer / Unpacked Installation

#### Chrome / Brave / Edge / Opera
1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/stax.git
   cd stax
   ```
2. Build the extension bundle (if editing source files):
   ```bash
   node build.js
   ```
3. Open `chrome://extensions/` in your browser.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the root project directory.

#### Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` from the project directory.

---

##  AI Configuration (Optional)

Stax is fully functional offline using local rules. To enable AI Tab Sorting, Stacklet Companion Chat, and Natural Language Tab Search:

1. Click the **Stax** toolbar icon to open the panel.
2. Go to **Settings / Preferences**.
3. Choose your AI provider:
   * **Anthropic:** Input your Claude API Key (`claude-sonnet-4-6`).
   * **Google Gemini:** Input your Gemini API Key (`gemini-flash-latest`).
4. Click **Save**. API keys are stored securely in `chrome.storage.local`.

---

##  Privacy & Security First

Stax was engineered around strict data minimization:
* **No Page Content Scraping:** Stax never reads DOM content, page HTML, forms, inputs, or cookies.
* **Metadata Only:** Stax only processes tab titles and URLs.
* **Zero Remote Analytics:** All time tracking, statistics, tab lineage, and custom rules are saved locally in browser storage (`chrome.storage.local` and `chrome.storage.sync`).
* **Strict Allowlist:** Stacklet actions are sandboxed to explicit tab management operations. Untrusted protocols (`javascript:`, `data:`, `file:`) are blocked.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Build and test your changes (`node build.js`)
4. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
5. Push to the Branch (`git checkout -origin feature/AmazingFeature`)
6. Open a Pull Request

---

##  License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p center="align">Crafted with ❤️ for tab hoarders and power users everywhere.</p>