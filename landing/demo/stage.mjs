#!/usr/bin/env node
// Boots an isolated Kablan against a throwaway clone of this repository, so the demo video
// and the marketing stills are shot on a real build with real data and nothing private in
// frame. The instance keeps its own HOME, so it never touches ~/Library/Application Support
// or the projects you actually work on.
//
//   node landing/demo/stage.mjs            # boot the stage, print the URL, stay running
//   node landing/demo/stage.mjs --reset    # throw the clone and the database away first
//
// Agent credentials are symlinked in from the real HOME, because Kablan drives each agent's
// own CLI and those CLIs read ~/.claude, ~/.codex and friends.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STAGE = process.env.KABLAN_DEMO_STAGE || path.join(os.homedir(), '.kablan-demo-stage');
const PORT = Number(process.env.KABLAN_DEMO_PORT || 5410);
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const RESET = process.argv.includes('--reset');

const HOME = path.join(STAGE, 'home');
const REPO = path.join(STAGE, 'repo');
const DATA = path.join(HOME, 'Library', 'Application Support', 'dev.kablan.Kablan');

const api = (p, init) =>
  fetch(`http://127.0.0.1:${PORT}/api${p}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  }).then(async (r) => {
    const body = await r.json();
    if (!body.success) throw new Error(`${p}: ${body.message || JSON.stringify(body.error_data)}`);
    return body.data;
  });

/** The newest binary the npx wrapper has cached — the same artefact a stranger gets. */
function latestReleaseBinary() {
  const binRoot = path.join(os.homedir(), '.kablan', 'bin');
  const platform = `${process.platform === 'darwin' ? 'macos' : process.platform}-${
    process.arch === 'arm64' ? 'arm64' : 'x64'
  }`;
  const versions = fs
    .readdirSync(binRoot)
    .filter((v) => fs.existsSync(path.join(binRoot, v, platform, 'kablan')))
    .sort((a, b) => collateVersion(b) - collateVersion(a));
  if (!versions.length) {
    throw new Error(`No cached Kablan binary under ${binRoot}. Run \`npx kablan\` once first.`);
  }
  return path.join(binRoot, versions[0], platform, 'kablan');
}

const collateVersion = (v) =>
  v
    .replace(/^v/, '')
    .split('.')
    .reduce((acc, part) => acc * 1000 + Number(part || 0), 0);

function cloneRepo() {
  if (RESET) fs.rmSync(REPO, { recursive: true, force: true });
  if (fs.existsSync(REPO)) return;
  fs.mkdirSync(STAGE, { recursive: true });
  // Explicitly off main: a clone of a working copy inherits whatever branch that copy has
  // checked out, and the attempt's target branch has to exist or the worktree never opens.
  run('git', ['clone', '--no-hardlinks', '--branch', 'main', REPO_ROOT, REPO]);
  // Point at the public remote so the branch names and the PR affordances in frame are the
  // ones a viewer would actually get, not a path on this machine.
  run('git', ['remote', 'set-url', 'origin', 'https://github.com/AmarShaked/kablan.dev.git'], REPO);
}

function run(cmd, args, cwd = process.cwd()) {
  const { status, stderr } = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${stderr}`);
}

/**
 * A HOME that is the real one in every respect except Kablan's own data directory.
 *
 * Kablan resolves that directory from HOME and gives us no override (see
 * crates/utils/src/assets.rs), so a fresh database means a fresh HOME. But the agent CLIs
 * Kablan launches read their credentials out of HOME too, and they are fussy about it —
 * Claude Code reports "Not logged in" against a HOME that merely has ~/.claude symlinked.
 * So mirror every entry straight through, and carve out only the one directory we want
 * isolated: ~/Library/Application Support/dev.kablan.Kablan.
 */
function buildShadowHome() {
  const real = os.homedir();
  const mirror = (realDir, shadowDir, carveOut) => {
    fs.mkdirSync(shadowDir, { recursive: true });
    for (const entry of fs.readdirSync(realDir)) {
      if (entry === carveOut) continue;
      const dest = path.join(shadowDir, entry);
      if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) continue;
      try {
        fs.symlinkSync(path.join(realDir, entry), dest);
      } catch {
        // A stale link from a previous run; the next run resets the stage anyway.
      }
    }
  };

  mirror(real, HOME, 'Library');
  mirror(path.join(real, 'Library'), path.join(HOME, 'Library'), 'Application Support');
  mirror(
    path.join(real, 'Library', 'Application Support'),
    path.join(HOME, 'Library', 'Application Support'),
    'dev.kablan.Kablan',
  );
  fs.mkdirSync(DATA, { recursive: true });
}

/** First run shows a safety notice and the system theme. Neither belongs in a still. */
function settleConfig() {
  const file = path.join(DATA, 'config.json');
  if (!fs.existsSync(file)) return false;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.disclaimer_acknowledged = true;
  config.onboarding_acknowledged = true;
  config.show_release_notes = false;
  config.theme = 'LIGHT';
  config.enabled_agents = ['CLAUDE_CODE', 'CODEX'];
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return true;
}

function boot() {
  if (RESET) fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });
  const child = spawn(latestReleaseBinary(), [], {
    env: {
      ...process.env,
      HOME,
      // Worktrees land under TMPDIR; keeping them in the stage means a re-shoot can reuse
      // the same branches instead of starting the agents over.
      TMPDIR: path.join(STAGE, 'tmp'),
      PORT: String(PORT),
      HOST: '127.0.0.1',
      BROWSER: 'none',
      DISABLE_WORKTREE_CLEANUP: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[kablan] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[kablan] ${d}`));
  return child;
}

const waitFor = async (fn, label, ms = 30000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
};

cloneRepo();
buildShadowHome();
const server = boot();
process.on('exit', () => server.kill());
process.on('SIGINT', () => { server.kill(); process.exit(0); });

await waitFor(() => api('/projects'), 'the server');
// The server writes config.json a moment after it starts answering, so settle it on a wait
// rather than once — otherwise the first-run safety notice is still there at capture time.
await waitFor(
  () => (settleConfig() ? true : Promise.reject(new Error('no config.json yet'))),
  'the config file',
);
server.kill();
await new Promise((r) => setTimeout(r, 1500));
const restarted = boot();
process.on('exit', () => restarted.kill());
process.on('SIGINT', () => { restarted.kill(); process.exit(0); });
await waitFor(() => api('/projects'), 'the restarted server');

const projects = await api('/projects');
if (!projects.some((p) => p.name === 'kablan')) {
  await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'kablan', repositories: [{ display_name: 'kablan', git_repo_path: REPO }] }),
  });
}

console.log(`\nStage ready — http://localhost:${PORT}`);
console.log(`  repo   ${REPO}`);
console.log(`  data   ${DATA}`);
console.log('Ctrl-C to stop.\n');
