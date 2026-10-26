#!/usr/bin/env node
// The two tasks the demo video runs. Both are real gaps in this repository, small enough to
// finish on camera, and they touch disjoint trees — npx-cli/ and frontend/src/ — which is the
// whole argument the video is making: two agents, two worktrees, nothing stepping on anything.
//
//   node landing/demo/seed-tasks.mjs          # create both and start them, back to back
//   node landing/demo/seed-tasks.mjs --dry    # print what it would do
//
// Run landing/demo/stage.mjs first.

const PORT = Number(process.env.KABLAN_DEMO_PORT || 5410);
const DRY = process.argv.includes('--dry');

const api = (p, init) =>
  fetch(`http://127.0.0.1:${PORT}/api${p}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  }).then(async (r) => {
    const body = await r.json();
    if (!body.success) throw new Error(`${p}: ${body.message || JSON.stringify(body.error_data)}`);
    return body.data;
  });

const TASKS = [
  {
    executor: 'CLAUDE_CODE',
    title: 'npx kablan --version should print the version and exit',
    description: [
      'Right now `npx kablan --version` falls straight through to booting the server, so someone',
      'checking what they just ran gets a web app instead of an answer.',
      '',
      'In npx-cli/bin/cli.js, handle --version (and -v) the way --install and --uninstall are',
      'handled: print the wrapper version and the cached binary version it would run, then return.',
      'Keep it above the update check so it stays instant and works offline. Touch only npx-cli/.',
    ].join('\n'),
  },
  {
    executor: 'CURSOR_AGENT',
    title: 'Put the project and task name in the browser tab title',
    description: [
      'Every tab reads just "Kablan", so two Kablan windows are indistinguishable in the tab strip',
      '— which is exactly the situation you are in when two agents are running.',
      '',
      'In the frontend, set document.title from the route: "<project> - Kablan" on a project,',
      '"<task> - Kablan" on an open task, plain "Kablan" everywhere else. Touch only frontend/src/.',
    ].join('\n'),
  },
];

const project = (await api('/projects')).find((p) => p.name === 'kablan');
if (!project) throw new Error('No "kablan" project — run landing/demo/stage.mjs first.');
const repo = (await api(`/projects/${project.id}/repositories`))[0];

for (const spec of TASKS) {
  if (DRY) {
    console.log(`${spec.executor.padEnd(13)} ${spec.title}`);
    continue;
  }
  const task = await api('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      project_id: project.id,
      title: spec.title,
      description: spec.description,
      status: null,
      parent_workspace_id: null,
      image_ids: null,
      source_provider: null,
      source_id: null,
      source_identifier: null,
      source_url: null,
    }),
  });
  const attempt = await api('/task-attempts', {
    method: 'POST',
    body: JSON.stringify({
      task_id: task.id,
      agent_selection: { executor: spec.executor, model: null, permission: 'BYPASS' },
      repos: [{ repo_id: repo.id, target_branch: 'main' }],
    }),
  });
  console.log(`${spec.executor.padEnd(13)} ${attempt.branch}  ${spec.title}`);
  // Back to back, not simultaneous: the video shows a person starting one and then the other.
  await new Promise((r) => setTimeout(r, 4000));
}
