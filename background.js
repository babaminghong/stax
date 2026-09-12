// background.js: service worker entry point.
// All logic lives in modules/ — this file just imports them in dependency
// order and starts the two initialisation routines that run on startup.
//
// Load order matters because MV3 service workers don't support ES modules
// (importScripts is the only way to share code between files), and
// importScripts executes each file in the global scope, so every function
// defined in an earlier file is available to all later ones.
//
//   classifier.js  — pure functions, no dependencies
//   sort.js        — uses classifier
//   ai.js          — uses sort (safeGroup)
//   actions.js     — uses sort, classifier
//   stacklet.js    — uses sort, actions
//   features.js    — uses all of the above + wires the message router

try {
  importScripts(
    "modules/classifier.js",
    "modules/sort.js",
    "modules/ai.js",
    "modules/actions.js",
    "modules/stacklet.js",
    "modules/features.js"
  );
} catch (err) {
  console.error("Stax: failed to import modules", err);
}