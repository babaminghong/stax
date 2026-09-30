# Stax v1.4.0

> A privacy-first tab manager and AI browsing companion for Chrome and Firefox.

Stax organizes your open tabs into colour-coded groups. By default, it uses local rules, making sorting instant and fully offline. You can also provide your own Anthropic or Gemini API key for additional tab classification. Your browsing data stays on your machine unless you enable that feature.

---

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)

[![Browsers](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Firefox%20%7C%20Edge%20%7C%20Brave-orange.svg)](#installation--setup)

[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local-green.svg)](#privacy--security)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why Stax? That's the question you may ask yourself now.

Thirty tabs become thirty little mysteries spread across a couple of windows. Most tab managers either leave you to organize them manually or inspect your page content and send that information elsewhere.

Stax takes a different approach.

Most tabs are classified immediately using domain and URL rules that execute locally, without making a network request. Tabs that do not match those rules can be handled using the optional external provider you configure.

---

## Key Features

### Hybrid sorting

Stax automatically sorts tabs into groups such as Development, Social, Productivity, Finance, Shopping, News and Travel.

Classification happens in stages. Exact domain matches are checked first, followed by structural indicators such as `.shop` and `.bank` domains, `/cart` and `/checkout` paths, and `/pull/` paths on Git hosts. Shared words in tab titles are also considered. For example, several React Router pages can be grouped under "React Router" instead of being labelled with their hostname.

Tabs that still do not have a match can use the configured provider when a key has been added.

### Duplicate cleanup

Before comparing tabs, Stax removes common tracking parameters such as `utm_source`, `fbclid` and `gclid`. Multiple copies of the same article opened through different tracked links can therefore be recognised as duplicates.

Fragments, trailing slashes and differences in parameter ordering are ignored as well.

### Stacklet

Stacklet is the little companion sitting on the Stax logo. He can organize tabs, recommend cleanups, save sessions and open research material.

By default, Stacklet suggests actions and waits for your approval. You can disable that approval step in settings if you prefer. His capabilities are restricted to a predefined set of tab operations, so he cannot perform anything outside Stax's existing capabilities.

Ignore him for long enough and he'll fall asleep. Using the extension also unlocks various accessories for him. None of that improves tab management. It's just there for fun.

### Tab tree

Chrome keeps track of which tab was opened from which other tab, but does not provide a useful view of that relationship. Stax rebuilds the hierarchy so you can follow how a research session branched over time.

### Memory saving

Tabs that have been untouched for 20 minutes can be discarded to reduce memory usage. Selecting one restores it to the previous page. Tabs currently playing audio are excluded.

### Focus mode

Focus mode hides every group except the one you're currently working in. When you leave focus mode, the other groups are restored to their previous state.

### Sessions and Read Later

A window can be saved as a named session, preserving its group names and colours. Saved sessions can be reopened later, including after restarting the browser.

Tabs that have not been opened for seven days can also be moved into a local Read Later list rather than simply being closed, giving you a way to clear old tabs without losing them entirely.

### Natural language search

Find tabs by entering part of their title, or describe what you're looking for in natural language, such as "where was I looking at flight status", and let the configured provider find the relevant tab.

### Time tracking

Stax records how much time you spend in each category locally. It accounts for rapid tab switching and periods when the computer is asleep so that those measurements remain meaningful. Tracking data is automatically wiped after 21 days.

### Markdown export

Export the current window as a grouped list of Markdown links that you can paste directly into your notes.

---

## How it works

Stax processes each tab through four classification stages. As soon as a stage produces a match, the tab does not continue to the next one.

![How Stax Works](images/how-stax.png)

Domain comparisons use exact matching rather than substring matching. For example, `amazon.com.evil.ru` will never be treated as a match for `amazon.com`.

---

## Keyboard Shortcuts

Chrome permits only four extension shortcuts to have default bindings. The remaining commands start unassigned, but you can configure them yourself through `chrome://extensions/shortcuts`.

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

1. Navigate to `chrome://extensions`
2. Enable Developer mode
3. Choose **Load unpacked** and select the `stax` directory

### Firefox 139+

Stax requires a separate Firefox manifest because the tab-group API it relies on became available in Firefox 139.

```bash
cp manifest.json manifest.chrome.json

cp manifest.firefox.json manifest.json
```

Next, open `about:debugging#/runtime/this-firefox` and load the extension as a temporary add-on. Refer to [browsers.md](browsers.md) for the complete set of browser-specific differences.

Whenever you modify files inside `modules/`, run `node build.js` before reloading the extension. The command bundles those modules into `background.js`.

---

## AI Configuration (optional)

The core extension works without an API key. A key is only needed for the optional external classification and search features.

1. Open the Stax popup and enter Settings
2. Select either Anthropic (`claude-sonnet-4-6`) or Gemini (`gemini-flash-latest`)
3. Enter your API key and save it

API keys are stored in `chrome.storage.local`, so they remain on the current device and are not synchronised. They are stored as plain text, which is typical for browser extensions, so handle the key with the same care you would give it elsewhere.

---

## Privacy & Security

Stax only needs access to tab titles and URLs.

- It never reads page content, the DOM, forms, inputs or cookies
- There is no analytics collection, telemetry or background communication
- Time tracking, statistics, tab relationships and classification rules are kept in browser-local storage
- When the optional provider is enabled, only tab titles and hostnames are transmitted to the provider you selected
- Stacklet can execute only operations included in its allowlist; unsupported actions are discarded, while `javascript:`, `data:` and `file:` URLs are blocked

---

## Development

```text
modules/      background logic (bundled into background.js through build.js)
tests/        run with: node tests/run.js
_locales/     English and German strings
```

After modifying anything under `modules/`, run `node build.js` before reloading the extension.

---

## License

MIT. See [LICENSE](LICENSE).