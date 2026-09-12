// browser-polyfill.js
// Firefox implements the same WebExtension surface as Chrome but under the
// `browser` namespace with promise-returning methods, while Chrome uses
// `chrome` with callbacks (and, since MV3, promises for most APIs too).
//
// Rather than pull in Mozilla's full polyfill (~30KB, and most of it covers
// APIs Stax never touches), this aliases the namespace and patches only the
// handful of real differences. Load it before every other script.
//
// Ordering note: this must run before shared.js, because shared.js calls
// chrome.storage at module scope.

(function () {
  // Firefox: expose `chrome` as an alias so existing calls keep working.
  if (typeof globalThis.chrome === "undefined" && typeof globalThis.browser !== "undefined") {
    globalThis.chrome = globalThis.browser;
  }
  // Chrome: expose `browser` too, so either name works in new code.
  if (typeof globalThis.browser === "undefined" && typeof globalThis.chrome !== "undefined") {
    globalThis.browser = globalThis.chrome;
  }

  const api = globalThis.chrome;
  if (!api) return;

  // Firefox has no chrome.sessions.getRecentlyClosed in the same shape on
  // all versions, and no sessions API at all on Android. Recently Closed
  // degrades to an empty list rather than throwing and blanking the card.
  if (!api.sessions) {
    api.sessions = {
      getRecentlyClosed: async () => [],
      restore: async () => { throw new Error("sessions API unavailable"); },
    };
  }

  // storage.session landed later in Firefox. Fall back to an in-memory shim:
  // it loses state across a worker restart, which the callers already treat
  // as an expected condition (see the comments around tabLastActive).
  if (api.storage && !api.storage.session) {
    const mem = {};
    api.storage.session = {
      get: async (keys) => {
        if (keys == null) return { ...mem };
        const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
        const out = {};
        list.forEach(k => { if (k in mem) out[k] = mem[k]; });
        return out;
      },
      set: async (obj) => { Object.assign(mem, obj); },
      remove: async (keys) => {
        (Array.isArray(keys) ? keys : [keys]).forEach(k => delete mem[k]);
      },
    };
  }

  // Firefox uses browser.sidebarAction instead of chrome.sidePanel. Only the
  // one call Stax makes is bridged; anything else would be dead code.
  if (!api.sidePanel && api.sidebarAction) {
    api.sidePanel = {
      setPanelBehavior: async () => {},
      open: async () => api.sidebarAction.open(),
    };
  }

  // tabs.discard is Chrome-only. Firefox's equivalent is tabs.discard as
  // well on recent versions, but on older ones it simply doesn't exist, and
  // suspending is a nice-to-have rather than load-bearing.
  if (api.tabs && !api.tabs.discard) {
    api.tabs.discard = async () => { throw new Error("discard unsupported"); };
  }
})();