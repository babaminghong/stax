# Stax

A browser extension that groups your open tabs by topic and color, automatically
or with an AI pass, so you can actually find things in a 30-tab window.

## Main-Part

**Problem:** once you pass ~15 open tabs, browsers just show favicons in a
shrinking strip. Finding "that one doc from earlier" means hovering over ten
tabs one by one.

**What it does:**
1. **Instant local sort** — every new/updated tab gets grouped by domain and a
   small ruleset (dev sites, docs, comms, shopping, distraction sites) with no
   network call, so it's free and immediate.
2. **AI sort on demand** — sends tab titles + hostnames (not full URLs, to
   avoid leaking query params/tokens) to your choice of Claude Haiku or
   Google's Gemini free tier, which returns 2-4 named groups + colors. Good
   for tabs local rules can't tell apart, like three different GitHub tabs
   that are actually three different projects. Provider is a dropdown in
   Settings — Gemini needs no billing, so it's the easiest way to try this
   without paying anything.
3. **Manual override** — every tab has a "Move…" dropdown to reassign it or
   ungroup it, no AI required.

Groups the extension creates are remembered by id, so re-sorting reuses the
same group instead of duplicating it, and it never touches tab groups you made
yourself by hand.

## Security

- **Minimal permissions.** Only `tabs`, `tabGroups`, `storage`, and host
  permissions for `api.anthropic.com` and `generativelanguage.googleapis.com`
  — only the one you actually pick gets called. No `<all_urls>`, no content
  script injected into pages you visit.
- **Your key stays local.** Whichever provider's key you save lives in
  `chrome.storage.local` (device-only, not `chrome.storage.sync`), is never
  logged, and is only ever sent as a header/param on a direct request to that
  provider's own API — nowhere else.
- **Least data sent.** Only tab titles and hostnames go to the AI call, never
  full URLs (which can contain session tokens or query params) and never page
  content.
- **No remote code.** Everything ships in the extension bundle; nothing is
  `eval`'d or fetched as executable code, satisfying MV3's default CSP.
- **Fails safe.** No key saved → clear message, not a silent crash. AI call
  has a 15s cooldown so a misclick can't hammer the API or your usage bill.

## Design

- **Palette:** deep navy (#1B1F2E) background, warm amber (#E3A857) as the one
  accent, tab-group colors reused for group labels so the popup's colors match
  what you actually see in the browser's tab strip.
- **Motion, once:** the only animation is a short highlight pulse on groups
  right after a sort — nothing hovers, bounces, or slides on every interaction.
  Respects `prefers-reduced-motion`.
- **No web fonts.** System font stack only — no external font requests, so the
  popup opens instantly and works offline.
- **Performance:** local sort is debounced (400ms) so rapid tab opening/closing
  doesn't trigger a burst of group updates; the AI path only ever runs when you
  click the button, never in the background, so it can't cause browsing lag.

## Try it

1. `chrome://extensions` → enable Developer Mode → **Load unpacked** → select
   this folder.
2. Click the extension icon → **API key & settings** → pick a provider.
   For free, no-card testing: choose **Gemini**, grab a key at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey), paste it in.
   Gemini's free-tier model names shift over time — the default
   (`gemini-flash-latest`) should resolve automatically, but if a sort ever
   fails, check [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)
   for the current free Flash model name and paste it into the "Model name" field.
3. Open a pile of tabs, click **Sort with AI**.
