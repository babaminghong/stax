# Stax v1.4.0

> A privacy-first tab manager and AI browsing companion for Chrome and Firefox.

Stax sorts your open tabs into colour-coded groups. It runs on local rules by default, so it's instant and works offline, and you can plug in your own Anthropic or Gemini key if you want AI to handle the tabs the rules can't figure out. Nothing about your browsing leaves your device unless you turn that on yourself.

---

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Browsers](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Firefox%20%7C%20Edge%20%7C%20Brave-orange.svg)](#installation--setup)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local-green.svg)](#privacy--security)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why Stax? That's the question you may ask yourself now.

You end up with thirty tabs across two windows and no idea what's in any of them. Most tab managers either make you sort everything by hand, or they read your page content and send it off somewhere.

Stax does neither.

Most tabs get sorted instantly by domain and URL rules that run on your machine, with no network request at all. For the ones that don't match anything, AI is optional and only ever sees the tab title and hostname. Never the page, never cookies, never form data.

---

## Key Features

### Hybrid sorting

Tabs get grouped into categories like Development, Social, Productivity, Finance, Shopping, News and Travel.

The classifier checks exact domains first, then structural patterns (`.shop` and `.bank` domains, `/cart` and `/checkout` paths, `/pull/` on git hosts), then shared words across tab titles. A group of React Router pages gets named "React Router" rather than the hostname.

Anything still unmatched goes to AI, if you've set a key.

### Duplicate cleanup

Strips tracking parameters like `utm_source`, `fbclid` and `gclid` before comparing, so the same article opened from three different links counts as one tab. Trailing slashes, fragments and parameter order are ignored too.

### Stacklet

A companion who sits on the logo. He can group tabs, suggest cleanups, save sessions, and open research material for you.

He proposes actions and waits for you to approve them, unless you switch that off in settings. He can only run a fixed list of tab operations, so there's nothing he can do that Stax itself can't.

He also falls asleep if you ignore him and unlocks accessories as you use the extension. That part isn't useful, it's just fun.

### Tab tree

Chrome quietly records which tab opened which, and nothing surfaces it. Stax reconstructs the trail so you can see how a research session actually branched.

### Memory saving

Tabs you haven't touched in 20 minutes get discarded to free memory. Click one and it reloads where you left it. Anything playing audio is left alone.

### Focus mode

Collapses every group except the one you're working in, and puts them all back the way they were when you exit.

### Sessions and Read Later

Save a window as a named session, including group names and colours, and reopen it later even after a restart.

Tabs you haven't opened in a week can be archived to a local Read Later list instead of just closed, so you stop hoarding tabs out of guilt.

### Natural language search

Search your tabs by typing part of a title, or describe one ("where was I looking at flight status") and let AI find it.

### Time tracking

Tracks time per category, locally. Guards against rapid tab switches and machine sleep so the numbers mean something. Data is pruned after 21 days.

### Markdown export

Copies your whole window as a grouped markdown link list, ready to paste into notes.

---

## How it works

Four passes. Each tab stops at the first one that matches.

```text
[ Incoming Tab ]
       |
       v
+---------------------------+
|  1. Custom rules          |  your own domain rules  -> grouped
+-------------+-------------+
              | no match
              v
+---------------------------+
|  2. Built-in domains      |  known sites            -> grouped
+-------------+-------------+
              | no match
              v
+---------------------------+
|  3. Pattern signals       |  TLD / path / title     -> grouped
+-------------+-------------+
              | leftovers, and only if a key is set
              v
+---------------------------+
|  4. AI on metadata        |  Claude or Gemini       -> grouped
+---------------------------+
```

Domain matching is exact, not substring. `amazon.com.evil.ru` can never match `amazon.com`.

---

## Keyboard Shortcuts

Chrome only allows four default bindings per extension, so the rest are unassigned. You can set them yourself at `chrome://extensions/shortcuts`.

| Command | Default | What it does |
| :--- | :--- | :--- |
| `quick-sort` | `Alt+S` | Smart Sort the current window |
| `quick-find` | `Alt+F` | Open tab search |
| `toggle-focus` | `Alt+D` | Toggle focus mode |
| `dedupe-tabs` | `Alt+X` | Close duplicate tabs |
| `suspend-inactive` | none | Suspend tabs idle over 20 minutes |
| `save-session` | none | Save the current window as a session |
| `archive-stale` | none | Archive tabs older than 7 days |
| `undo-last` | none | Undo the last Stax action |

---

## Installation & Setup

```bash
git clone https://github.com/babaminghong/stax.git
cd stax
```

### Chrome, Brave, Edge, Opera

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked and select the `stax` folder

### Firefox 139+

Firefox needs its own manifest, and the tab group API Stax depends on only landed in Firefox 139.

```bash
cp manifest.json manifest.chrome.json
cp manifest.firefox.json manifest.json
```

Then open `about:debugging#/runtime/this-firefox` and load it as a temporary add-on. See [browsers.md](browsers.md) for the full list of differences.

If you change anything in `modules/`, run `node build.js` before reloading. That bundles them into `background.js`.

---

## AI Configuration (optional)

Everything except the AI features works without a key.

1. Open the Stax popup and go to Settings
2. Pick Anthropic (`claude-sonnet-4-6`) or Gemini (`gemini-flash-latest`)
3. Paste your key and save

Keys are kept in `chrome.storage.local`, which means they stay on that device and never sync. They're stored as plain text, the same way every extension does it, so treat the key the way you would anywhere else.

---

## Privacy & Security

Stax reads tab titles and URLs. That's the whole list.

- No page content, DOM, forms, inputs or cookies are ever read
- No analytics, no telemetry, nothing phones home
- Time tracking, stats, tab lineage and rules all stay in browser storage
- If you enable AI, only tab titles and hostnames are sent, and only to the provider you picked
- Stacklet's actions are limited to an allowlist. Anything outside it is dropped before it runs, and `javascript:`, `data:` and `file:` URLs are blocked

---

## Development

```
modules/      background logic, bundled into background.js by build.js
tests/        run with: node tests/run.js
_locales/     English and German strings
```

Run `node build.js` after editing anything in `modules/`, then reload the extension.

---

## License

MIT. See [LICENSE](LICENSE).