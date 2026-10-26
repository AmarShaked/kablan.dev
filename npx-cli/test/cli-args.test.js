const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { helpText, KNOWN_FLAGS } = require("../bin/cli");
const { version: PKG_VERSION } = require("../package.json");

const CLI = path.join(__dirname, "..", "bin", "cli.js");

/**
 * `--version` and `--help` used to fall through to "download a binary, start a server, open a
 * browser" — the two most likely first commands at an unfamiliar CLI, answered by launching an
 * application.
 *
 * These run the real entry point rather than calling into it, because what is being asserted is
 * that the process exits: a test that imported main() and mocked the launch could pass while the
 * shipped command still opened a browser. The timeout is what fails if that regresses.
 */
function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    if (err.killed) assert.fail(`\`${args.join(" ")}\` did not exit — it is still running`);
    return {
      status: err.status,
      stdout: String(err.stdout || ""),
      stderr: String(err.stderr || ""),
    };
  }
}

test("--version prints the version and exits, without starting anything", () => {
  const { status, stdout } = run(["--version"]);
  assert.strictEqual(status, 0);
  assert.strictEqual(stdout.trim(), `kablan ${PKG_VERSION}`);
});

test("-V is --version", () => {
  assert.strictEqual(run(["-V"]).stdout.trim(), `kablan ${PKG_VERSION}`);
});

test("--help prints the usage and exits, without starting anything", () => {
  const { status, stdout } = run(["--help"]);
  assert.strictEqual(status, 0);
  assert.match(stdout, /^kablan \d+\.\d+\.\d+ —/);
  assert.match(stdout, /npx kablan --install/);
  assert.match(stdout, /npx kablan --uninstall/);
  assert.match(stdout, /npx kablan --mcp/);
});

test("-h is --help", () => {
  assert.strictEqual(run(["-h"]).stdout, run(["--help"]).stdout);
});

test("the help names every flag the CLI accepts", () => {
  // The failure this catches is a flag added to the dispatch and not to the help, which is how a
  // CLI ends up with undocumented behaviour nobody can find.
  const help = helpText();
  for (const flag of KNOWN_FLAGS) {
    if (flag === "-h" || flag === "-V") continue; // aliases, deliberately not advertised
    assert.ok(help.includes(flag), `${flag} is accepted but not in --help`);
  }
});

test("an unknown argument says so instead of starting a server", () => {
  // `--instal` used to start Kablan: unrecognised arguments fell through to the default path,
  // and the wrapper forwards nothing to the binary, so the typo was silently discarded.
  const { status, stderr } = run(["--instal"]);
  assert.strictEqual(status, 2);
  assert.match(stderr, /Unknown argument: --instal/);
  assert.match(stderr, /--help/);
});

test("the help answers before the platform check, so it works where we ship no binary", () => {
  // getPlatformDir() exits with a message on an unsupported platform. It used to run at import,
  // which made --help unreachable on exactly the machine whose owner most needs to read it.
  assert.doesNotThrow(() => helpText());
  assert.match(helpText(), /Node 18 or newer/);
});
