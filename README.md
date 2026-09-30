# Stax v1.5.0

You may be wondering now, what is Stax and what can Stax do?

Stax is a browser extension that supports **Firefox, Brave, and Chrome**, with support for other Chromium-based browsers too.

Stax is made to make your messy browser a bit more organized. It uses local sorting patterns that I have built into the extension, which work offline and do not need an internet connection.

You can also connect your own **Anthropic or Gemini API key** if you want to use the AI features. This is completely optional.

The AI features also introduce **Stacklet**, but more about him later.

---
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Browsers](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Firefox%20%7C%20Edge%20%7C%20Brave-orange.svg)](#installation--setup)
[![Privacy First](https://img.shields.io/badge/Privacy-Local%20First-green.svg)](#privacy--security)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Privacy First

I was thinking about making Stax paid so that people would have to pay to use the AI features. The problem is that this would make some features unavailable to people who cannot or do not want to pay for them.

So instead, Stax is **free of charge** and the main features work locally and offline.

I put a lot of focus on privacy while making Stax.

### But what does that actually mean?

Stax does not have a database.

Stax does not send your data to me.

There is no analytics system collecting information about how you use the extension.

Most of the data Stax needs is kept locally in your browser.

There is one important exception. If you decide to use your own API key with Anthropic or Gemini, then data needed for the AI feature you are using can be sent to that API provider.

For example, if you use an AI feature to classify or search your tabs, the information needed for that request has to be sent to the provider you selected.

I have no business relationship with Anthropic or Google, and Stax does not operate its own server in the middle of these requests.

If you do not configure an AI provider, the main Stax features stay local.

---

## What Can Stax Do?

You can skip this section if you want.

Stax has a built-in tutorial that introduces the features and explains how they work.

Here is a quick overview anyway.

### Smart Sorting

Stax automatically sorts your tabs into groups using local classification rules.

For example, you can end up with groups such as:

* Development
* Social
* Productivity
* Finance
* Shopping
* News
* Travel

The sorting happens in several stages.

Stax first checks exact domains, then looks at things such as domain endings, URL paths, and words in tab titles.

So something like:

```text
example.com/shop
```

can be recognised as a shopping page even if the exact website is not specifically listed.

It can also notice related pages. For example, several React Router pages can be grouped under **React Router** instead of just being thrown into a group based on their hostname.

If Stax still cannot figure out where a tab belongs, you can optionally let your configured AI provider classify it.

---

### Deduplicate

Do you have the same URL open five times?

Deduplicate lets you clean that up.

Stax also removes common tracking parameters such as `utm_source`, `fbclid`, and `gclid` when comparing URLs.

That means these two links can still be recognised as the same page:

```text
https://example.com/article
https://example.com/article?utm_source=something
```

Fragments, trailing slashes, and parameter ordering are also ignored when comparing URLs.

Actions can be reverted for a certain amount of time, so if you accidentally close something, you have a chance to undo it.

---

### Suspend

Suspend is there to save some RAM.

Tabs that have been inactive for a while can be discarded from memory instead of staying fully loaded.

This does **not** close the browser window.

The tab is still there. When you select it again, the page can be restored.

Tabs that are currently playing audio are excluded.

---

### Focus

Sometimes you are working on one project and really do not need 50 other tabs staring at you.

Focus hides the other tab groups so that only the group you are currently working on remains visible.

When you leave Focus Mode, the other groups are restored to how they were before.

---

### Save Session

Save Session is probably one of my favourite features.

Let's say you are working on your Physics homework, but then you realise you have to do something more important.

Like Maths.

Because you really failed that last test.

You can save your current browser session and call it **Physics**.

Now you can move on to your Maths work without having to keep all of your Physics tabs open.

When you are finished, open the dropdown menu at the bottom, select your saved **Physics** session, and Stax will restore it.

Your groups and their colours are saved too.

So you can basically put an entire project away and come back to it later.

---

### Archive Stale

This one is for those tabs that have been sitting open for a week and you keep telling yourself:

> "I'll read that later."

If a tab has not been opened for seven days, Archive Stale can move it into **Read Later** instead of simply closing it.

You can find those tabs again through the dropdown menu at the bottom.

So you can clean up your browser without completely losing all those things you were definitely going to read.

Definitely.

---

### Merge Windows

Do you have tabs sitting in five different browser windows for absolutely no reason?

Merge Windows pulls them together into one window.

All those lonely tabs sitting in a corner can finally become one big, happy tab family.

---

### Split Windows

And then maybe that family gets a little too big.

Split Windows does the opposite.

It takes your tab groups and puts each group into its own browser window.

---

### Snooze

Snooze works a bit like Save Session, but for individual tabs.

If you have a tab that you want to come back to later but do not need open right now, you can snooze it.

You can then reopen it later instead of keeping it open all the time.

---

### Export MD

Export MD lets you export your currently opened URLs as a Markdown list.

The result is formatted so you can paste it directly into your notes, a README, a document, or basically anywhere else that supports Markdown.

---

### Stacklet

And then there is Stacklet.

Stacklet is the little guy sitting on the Stax logo.

He is introduced when you use the optional AI features.

Stacklet can help organize tabs, suggest cleanups, save sessions, and find research material.

By default, Stacklet does not just start doing things on his own. He suggests an action and waits for your approval.

You can disable the approval step in the settings if you want him to be more automatic.

Stacklet also has a predefined list of things he is allowed to do. He cannot just randomly execute code or do things outside of what Stax supports.

And yes, he can fall asleep if you ignore him for long enough.

You can also unlock different accessories for him while using the extension.

They do absolutely nothing for tab management.

They are just there because I thought it was funny.

---

## How Stax Sorts Your Tabs

Stax processes tabs through multiple classification stages.

As soon as one of the stages finds a match, Stax stops and uses that result instead of continuing through the remaining stages.

![How Stax Works](images/how-stax.png)

One important thing here is that domain matching uses **exact matching**, not simple substring matching.

For example:

```text
amazon.com
```

can match Amazon.

But:

```text
amazon.com.evil.ru
```

will not be treated as Amazon.

This is important because I do not want a random domain to be classified as something else just because its name happens to contain another domain.

---

## AI Features

The AI features are optional.

Stax works without an API key, but if you want to use the AI-powered classification and search features, you can provide your own key.

Currently supported providers are:

* **Anthropic**
* **Google Gemini**

You can enter your API key through the Stax settings.

The key is stored using `chrome.storage.local`, so it stays on the current device and is not synchronised through your browser account.

The key is stored as plain text in local browser storage, so you should treat it like any other API key and keep it private.

When you use an AI feature, the information required for that feature can be sent to the provider you selected.

---

## Keyboard Shortcuts

Chrome only allows four extension shortcuts to have default bindings.

The other commands start without a shortcut, but you can configure them yourself through:

```text
chrome://extensions/shortcuts
```

| Command            | Default | What it does                          |
| :----------------- | :------ | :------------------------------------ |
| `quick-sort`       | `Alt+S` | Smart Sort the current window         |
| `quick-find`       | `Alt+F` | Open tab search                       |
| `toggle-focus`     | `Alt+D` | Toggle Focus Mode                     |
| `dedupe-tabs`      | `Alt+X` | Close duplicate tabs                  |
| `suspend-inactive` | None    | Suspend tabs idle for over 20 minutes |
| `save-session`     | None    | Save the current window as a session  |
| `archive-stale`    | None    | Archive tabs older than 7 days        |
| `undo-last`        | None    | Undo the last Stax action             |

---

## Installation & Setup

Clone the repository:

```bash
git clone https://github.com/babaminghong/stax.git
cd stax
```

### Chrome, Brave, Edge, and other Chromium-based browsers

1. Open `chrome://extensions/`
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `stax` directory.

### Firefox 139+

Stax needs a separate Firefox manifest because the tab-group API it uses became available in Firefox 139.

Run:

```bash
cp manifest.json manifest.chrome.json
cp manifest.firefox.json manifest.json
```

Then open:

```text
about:debugging#/runtime/this-firefox
```

Load Stax as a temporary add-on.

See [`browsers.md`](browsers.md) for the browser-specific differences.

Whenever you modify files inside `modules/`, run:

```bash
node build.js
```

before reloading the extension.

This bundles the modules into `background.js`.

---

## Privacy & Security

Stax needs access to tab information so that it can actually manage your tabs.

Stax does **not**:

* Read page content
* Read the DOM
* Read forms or inputs
* Read cookies
* Collect analytics
* Send telemetry to a Stax server
* Store your data in a Stax database

Things such as tab relationships, statistics, time tracking, and classification data are kept locally.

When an external AI provider is enabled, information needed for the AI feature can be sent to the provider you selected.

Stacklet is also restricted to a predefined list of supported operations. Unsupported actions are discarded, and `javascript:`, `data:`, and `file:` URLs are blocked.

---

## Development

```text
modules/       Background logic, bundled into background.js through build.js
tests/         Tests, run with: node tests/run.js
_locales/      English and German strings
```

After modifying anything under `modules/`, run:

```bash
node build.js
```

before reloading the extension.

---

## License

Stax is licensed under the **MIT License**.

See [`LICENSE`](LICENSE).