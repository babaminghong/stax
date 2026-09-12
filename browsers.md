# Browser support

| Browser | Status | Notes |
|---|---|---|
| Chrome / Brave / Edge | Fully supported | Primary target. MV3 service worker. |
| Firefox 139+ | Supported | Needs `manifest.firefox.json`. See below. |
| Firefox < 139 | Not supported | `tabGroups.update()` and the group events only landed in 139. Stax can't do its main job without them. |
| Safari | Not planned | No `tabGroups` API. |

## Building for Firefox

Firefox needs a different manifest, so swap it in before packaging:

```bash
node build.js                              # bundle modules into background.js
cp manifest.json manifest.chrome.json      # keep the Chrome one
cp manifest.firefox.json manifest.json     # swap in the Firefox one
# ... zip and upload to addons.mozilla.org ...
cp manifest.chrome.json manifest.json      # restore
```

### What differs on Firefox

- **Side panel**: Chrome uses `side_panel`, Firefox uses `sidebar_action`. Both point at the same `sidepanel.html`.
- **Background**: Firefox MV3 uses an event page (`background.scripts`) rather than a service worker.
- **`sessions` permission**: optional on Firefox, so Recently Closed degrades to an empty list instead of throwing. Handled in `browser-polyfill.js`.
- **`storage.session`**: shimmed to an in-memory object on older builds. State is lost on restart, which callers already treat as expected.
- **`tabs.discard`**: stubbed to throw where unavailable, so Suspend surfaces a clean error rather than breaking the popup.

All of the above is bridged in `browser-polyfill.js`, which loads before every
other script. Application code keeps calling `chrome.*` throughout.