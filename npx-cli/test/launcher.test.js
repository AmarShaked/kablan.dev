const { test } = require("node:test");
const assert = require("node:assert");

const { launcherScript, infoPlist } = require("../bin/install-app");

/**
 * What the Kablan.app icon runs was a decision, not an accident (audit finding F12): the launcher
 * prefers `npx kablan@latest` so a double-click gets the newest release, and falls back to the
 * checksummed copy inside the bundle only on a machine without node. The cost of that choice is
 * that `Info.plist` describes the fallback rather than what usually runs, and the docs have to say
 * so. These tests exist so the choice cannot be reversed by accident — if someone makes the icon
 * run the bundled binary instead, that is a product decision and this file should fail first.
 */

const script = launcherScript();

test("the icon runs the newest published release when npx is available", () => {
  assert.match(script, /nohup npx -y kablan@latest/);
});

test("a machine without node falls back to the binary inside the bundle", () => {
  assert.match(script, /nohup "\$HERE\/kablan-server"/);
  // The fallback has to be guarded, or a machine without node runs nothing at all.
  assert.match(script, /command -v npx >\/dev\/null 2>&1/);
});

test("the launcher says which of the two it took, in the log", () => {
  assert.match(script, /using npx kablan@latest/);
  assert.match(script, /npx not found; using the bundled kablan-server/);
});

test("a launch finds a server that is already up instead of starting a second one", () => {
  assert.match(script, /PORT_FILE/);
  assert.match(script, /api\/info/);
});

test("the launcher exits rather than holding the app's executable open", () => {
  // A .app whose executable never returns is reported as not responding, so this is load-bearing.
  assert.match(script, /\nexit 0\n$/);
});

test("Info.plist carries the version of the bundled fallback", () => {
  // Not what a double-click runs. The READMEs and the post-install output both say so; this
  // asserts only that the number is the one we passed, so the docs have something true to point at.
  const plist = infoPlist("0.11.7");
  assert.match(plist, /<key>CFBundleShortVersionString<\/key><string>0\.11\.7<\/string>/);
  assert.match(plist, /<key>CFBundleVersion<\/key><string>0\.11\.7<\/string>/);
});
