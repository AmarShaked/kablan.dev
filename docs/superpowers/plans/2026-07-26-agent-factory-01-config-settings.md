# Agent Factory — Plan 01: Config + Settings + Frontend Test Harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all Agent-Factory configuration to the backend config + a Settings → Agents tab, and stand up the frontend test harness (Vitest + React Testing Library) that every later Agent-Factory UI plan will use.

**Architecture:** Extend the existing `AppConfig` (serde, `~/.kablan/config.json`) with a nested `factory` settings group, refactor config patching into a pure, unit-tested `apply_patch`, and add a Settings tab that reads/writes those fields through the existing `api.updateConfig` path. Introduce Vitest + RTL as the frontend test runner (none exists today), kept separate from the Node black-box server suite.

**Tech Stack:** Rust (serde, serde_json), React 18 + Vite + TypeScript, shadcn/ui, Vitest + @testing-library/react + jsdom.

## Global Constraints

- **TDD:** every task writes a failing test first, then the minimal code to pass.
- **camelCase** JSON across the Rust ↔ TS boundary (matches existing `AppConfig`).
- Config lives only in `~/.kablan/config.json` via the existing `config` module; no secrets in config.
- The existing **75-test cross-backend parity suite stays green** (`npm run test:server` and `npm run test:server:rust`). New config fields must round-trip through the existing `/config` endpoint without breaking parity.
- Frontend Agent-Factory UI is gated on `isTauri` where it implies desktop-only behavior; the Settings tab itself renders in both, but factory features it configures are desktop-only.
- The new Vitest runner must **not** pick up the `server/test/*.test.ts` files (those use `node:test` and are run separately).
- Commit after each task with a `feat(factory):` or `test(factory):` / `chore(factory):` prefix.

## File Structure

- `src-tauri/src/config.rs` — add `FactorySettings` + `NotificationSettings`, add `factory` to `AppConfig`, refactor `save_patch` → pure `apply_patch` + writer, add unit tests.
- `web/api.ts` — add `FactorySettings`/`NotificationSettings` TS types to `AppConfig`.
- `vite.config.ts` — add a `test` block (jsdom, setup file, include only `web/**`).
- `web/test/setup.ts` — RTL/jest-dom setup (new).
- `web/components/AgentSettings.tsx` — the Agents settings card (new).
- `web/components/AgentSettings.test.tsx` — its component test (new).
- `web/components/SettingsPage.tsx` — add an "Agents" tab rendering `AgentSettings`.
- `package.json` — add Vitest devDeps + `test:web` scripts.

---

## Task 1: FactorySettings model + defaults (Rust)

**Files:**
- Modify: `src-tauri/src/config.rs`
- Test: `src-tauri/src/config.rs` (`#[cfg(test)]` module)

**Interfaces:**
- Produces: `pub struct FactorySettings` and `pub struct NotificationSettings` (both `Serialize + Deserialize + Clone + Default`, `#[serde(rename_all = "camelCase")]`); `AppConfig` gains `#[serde(default)] pub factory: FactorySettings`.

- [ ] **Step 1: Write the failing test**

Add at the bottom of `src-tauri/src/config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factory_defaults_when_absent() {
        // A config with no "factory" key loads with factory defaults.
        let cfg: AppConfig = serde_json::from_str(r#"{"parentDir":"/tmp"}"#).unwrap();
        assert_eq!(cfg.factory.agent_command, "claude");
        assert_eq!(cfg.factory.max_concurrent_agents, 4);
        assert!(cfg.factory.stop_agents_on_exit);
        assert!(!cfg.factory.auto_resume_agents);
        assert_eq!(cfg.factory.permission_mode, "default");
        assert!(cfg.factory.notifications.enabled);
        assert_eq!(cfg.factory.notifications.events, vec!["needsApproval", "failed"]);
    }

    #[test]
    fn factory_partial_merges_defaults() {
        // A partial "factory" object keeps defaults for the fields it omits.
        let cfg: AppConfig =
            serde_json::from_str(r#"{"factory":{"maxConcurrentAgents":8}}"#).unwrap();
        assert_eq!(cfg.factory.max_concurrent_agents, 8);
        assert_eq!(cfg.factory.agent_command, "claude"); // still default
    }

    #[test]
    fn factory_camelcase_roundtrip() {
        let cfg = AppConfig::default();
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"maxConcurrentAgents\""));
        assert!(json.contains("\"stopAgentsOnExit\""));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features config::tests`
Expected: FAIL to compile — `no field factory on AppConfig`.

- [ ] **Step 3: Implement the minimal code**

In `src-tauri/src/config.rs`, add the structs (place after `ProjectOverride`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_notify_events")]
    pub events: Vec<String>,
}

fn default_notify_events() -> Vec<String> {
    vec!["needsApproval".into(), "failed".into()]
}

impl Default for NotificationSettings {
    fn default() -> Self {
        NotificationSettings { enabled: true, events: default_notify_events() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactorySettings {
    #[serde(default = "default_agent_command")]
    pub agent_command: String,
    #[serde(default)]
    pub agent_model: String,
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    #[serde(default)]
    pub default_base_branch: String,
    #[serde(default)]
    pub worktree_root: String,
    #[serde(default = "default_branch_pattern")]
    pub branch_pattern: String,
    #[serde(default = "default_max_agents")]
    pub max_concurrent_agents: u32,
    #[serde(default = "default_true")]
    pub stop_agents_on_exit: bool,
    #[serde(default)]
    pub auto_resume_agents: bool,
    #[serde(default)]
    pub notifications: NotificationSettings,
}

fn default_agent_command() -> String { "claude".into() }
fn default_permission_mode() -> String { "default".into() }
fn default_branch_pattern() -> String { "feat/{feature}-{task}".into() }
fn default_max_agents() -> u32 { 4 }

impl Default for FactorySettings {
    fn default() -> Self {
        FactorySettings {
            agent_command: default_agent_command(),
            agent_model: String::new(),
            permission_mode: default_permission_mode(),
            default_base_branch: String::new(),
            worktree_root: String::new(),
            branch_pattern: default_branch_pattern(),
            max_concurrent_agents: default_max_agents(),
            stop_agents_on_exit: true,
            auto_resume_agents: false,
            notifications: NotificationSettings::default(),
        }
    }
}
```

Add the field to `AppConfig` (after `gitlab_hosts`):

```rust
    #[serde(default)]
    pub factory: FactorySettings,
```

And to `impl Default for AppConfig` (after `gitlab_hosts: Vec::new(),`):

```rust
            factory: FactorySettings::default(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features config::tests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(factory): FactorySettings config model + defaults"
```

---

## Task 2: Pure `apply_patch` + factory patching (Rust)

**Files:**
- Modify: `src-tauri/src/config.rs`
- Test: `src-tauri/src/config.rs` (`#[cfg(test)]` module)

**Interfaces:**
- Produces: `pub fn apply_patch(cfg: AppConfig, patch: &Value) -> AppConfig` (pure — no disk). `save_patch` becomes `load()` → `apply_patch` → `write` and keeps its existing signature/behavior.
- Consumes: existing patch keys (`parentDir`, `maxScanDepth`, …) plus a new `factory` object.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `config.rs`:

```rust
    #[test]
    fn apply_patch_updates_factory_fields() {
        let base = AppConfig::default();
        let patch = serde_json::json!({
            "factory": {
                "agentCommand": "/opt/homebrew/bin/claude",
                "maxConcurrentAgents": 6,
                "stopAgentsOnExit": false,
                "notifications": { "enabled": false, "events": ["done"] }
            }
        });
        let next = apply_patch(base, &patch);
        assert_eq!(next.factory.agent_command, "/opt/homebrew/bin/claude");
        assert_eq!(next.factory.max_concurrent_agents, 6);
        assert!(!next.factory.stop_agents_on_exit);
        assert!(!next.factory.notifications.enabled);
        assert_eq!(next.factory.notifications.events, vec!["done"]);
    }

    #[test]
    fn apply_patch_clamps_and_ignores_bad_values() {
        let base = AppConfig::default();
        // maxConcurrentAgents must stay >= 1; a 0 is ignored (keeps default).
        let patch = serde_json::json!({ "factory": { "maxConcurrentAgents": 0 } });
        let next = apply_patch(base, &patch);
        assert_eq!(next.factory.max_concurrent_agents, 4);
    }

    #[test]
    fn apply_patch_preserves_existing_keys() {
        let base = AppConfig::default();
        let patch = serde_json::json!({ "maxScanDepth": 5 });
        let next = apply_patch(base, &patch);
        assert_eq!(next.max_scan_depth, 5);
        assert_eq!(next.factory.agent_command, "claude"); // untouched
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features config::tests::apply_patch`
Expected: FAIL to compile — `cannot find function apply_patch`.

- [ ] **Step 3: Implement**

In `config.rs`, refactor. Move the body of the current `save_patch` into a pure `apply_patch(mut cfg, patch)` that returns `cfg`, then have `save_patch` call it. Replace the existing `save_patch` function with:

```rust
/// Apply a validated PUT patch to a config value (pure; no disk).
pub fn apply_patch(mut cfg: AppConfig, patch: &Value) -> AppConfig {
    if let Some(v) = patch.get("parentDir").and_then(|v| v.as_str()) {
        cfg.parent_dir = v.to_string();
    }
    if let Some(n) = patch.get("maxScanDepth").and_then(|v| v.as_f64()) {
        if n >= 1.0 {
            cfg.max_scan_depth = (n.floor() as u32).min(8);
        }
    }
    if let Some(arr) = patch.get("envFiles").and_then(|v| v.as_array()) {
        cfg.env_files = arr.iter().filter_map(|v| v.as_str())
            .map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    }
    if let Some(arr) = patch.get("devScriptPriority").and_then(|v| v.as_array()) {
        cfg.dev_script_priority = arr.iter().filter_map(|v| v.as_str())
            .map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    }
    if let Some(n) = patch.get("maxLogLines").and_then(|v| v.as_f64()) {
        if n > 0.0 {
            cfg.max_log_lines = n.floor() as u64;
        }
    }
    if let Some(b) = patch.get("showNonNodeProjects").and_then(|v| v.as_bool()) {
        cfg.show_non_node_projects = b;
    }
    if let Some(s) = patch.get("linearWorkspace").and_then(|v| v.as_str()) {
        cfg.linear_workspace = s.trim().to_string();
    }
    if let Some(f) = patch.get("factory") {
        apply_factory_patch(&mut cfg.factory, f);
    }
    cfg
}

fn apply_factory_patch(fac: &mut FactorySettings, f: &Value) {
    if let Some(s) = f.get("agentCommand").and_then(|v| v.as_str()) {
        let s = s.trim();
        if !s.is_empty() { fac.agent_command = s.to_string(); }
    }
    if let Some(s) = f.get("agentModel").and_then(|v| v.as_str()) {
        fac.agent_model = s.trim().to_string();
    }
    if let Some(s) = f.get("permissionMode").and_then(|v| v.as_str()) {
        if ["default", "acceptEdits", "plan", "bypassPermissions"].contains(&s) {
            fac.permission_mode = s.to_string();
        }
    }
    if let Some(s) = f.get("defaultBaseBranch").and_then(|v| v.as_str()) {
        fac.default_base_branch = s.trim().to_string();
    }
    if let Some(s) = f.get("worktreeRoot").and_then(|v| v.as_str()) {
        fac.worktree_root = s.trim().to_string();
    }
    if let Some(s) = f.get("branchPattern").and_then(|v| v.as_str()) {
        let s = s.trim();
        if !s.is_empty() { fac.branch_pattern = s.to_string(); }
    }
    if let Some(n) = f.get("maxConcurrentAgents").and_then(|v| v.as_f64()) {
        if n >= 1.0 { fac.max_concurrent_agents = (n.floor() as u32).min(64); }
    }
    if let Some(b) = f.get("stopAgentsOnExit").and_then(|v| v.as_bool()) {
        fac.stop_agents_on_exit = b;
    }
    if let Some(b) = f.get("autoResumeAgents").and_then(|v| v.as_bool()) {
        fac.auto_resume_agents = b;
    }
    if let Some(n) = f.get("notifications") {
        if let Some(b) = n.get("enabled").and_then(|v| v.as_bool()) {
            fac.notifications.enabled = b;
        }
        if let Some(arr) = n.get("events").and_then(|v| v.as_array()) {
            fac.notifications.events = arr.iter().filter_map(|v| v.as_str())
                .map(|s| s.to_string()).collect();
        }
    }
}

/// Apply a validated PUT patch and persist.
pub fn save_patch(patch: &Value) -> AppConfig {
    let cfg = apply_patch(load(), patch);
    write(&cfg);
    cfg
}
```

- [ ] **Step 4: Run tests + parity**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features config::tests`
Expected: PASS (6 tests).
Run: `npm run test:server:rust 2>&1 | tail -4`
Expected: `# fail 0` (config endpoint still round-trips; parity intact).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(factory): pure apply_patch + factory settings patching"
```

---

## Task 3: Frontend test harness (Vitest + RTL)

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `web/test/setup.ts`, `web/test/smoke.test.tsx`

**Interfaces:**
- Produces: `npm run test:web` (Vitest, jsdom, RTL), scoped to `web/**/*.test.{ts,tsx}`.

- [ ] **Step 1: Add dev dependencies**

Run:
```bash
npm i -D vitest@^2 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

- [ ] **Step 2: Add the Vitest config to `vite.config.ts`**

Change the first import line from `import { defineConfig } from "vite";` to:

```ts
import { defineConfig } from "vitest/config";
```

Add a `test` block inside the `defineConfig({...})` object (sibling of `server`, `build`):

```ts
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./web/test/setup.ts"],
    include: ["web/**/*.test.{ts,tsx}"],
  },
```

- [ ] **Step 3: Create the setup file**

`web/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write a smoke test (failing until deps/config exist)**

`web/test/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("renders a component", () => {
    render(<button>hello</button>);
    expect(screen.getByRole("button", { name: "hello" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Add scripts to `package.json`**

In `"scripts"`, add:

```json
    "test:web": "vitest run",
    "test:web:watch": "vitest"
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:web`
Expected: 1 passed. Confirm it does NOT run `server/test/*` (only the smoke test appears).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts web/test/setup.ts web/test/smoke.test.tsx
git commit -m "chore(factory): add Vitest + React Testing Library harness"
```

---

## Task 4: Factory config types on the frontend (TypeScript)

**Files:**
- Modify: `web/api.ts`

**Interfaces:**
- Consumes: the Rust `factory` JSON shape.
- Produces: `FactorySettings` + `NotificationSettings` TS interfaces; `AppConfig` gains `factory: FactorySettings`.

- [ ] **Step 1: Write the failing test**

`web/api.test.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest";
import type { AppConfig, FactorySettings } from "./api.ts";

describe("AppConfig factory types", () => {
  it("exposes factory settings", () => {
    expectTypeOf<AppConfig["factory"]>().toEqualTypeOf<FactorySettings>();
    expectTypeOf<FactorySettings["maxConcurrentAgents"]>().toBeNumber();
    expectTypeOf<FactorySettings["stopAgentsOnExit"]>().toBeBoolean();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:web -- api.test`
Expected: FAIL — `FactorySettings` is not exported / `factory` missing on `AppConfig`.

- [ ] **Step 3: Implement**

In `web/api.ts`, add near the `AppConfig` interface:

```ts
export interface NotificationSettings {
  enabled: boolean;
  events: string[];
}

export interface FactorySettings {
  agentCommand: string;
  agentModel: string;
  permissionMode: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  defaultBaseBranch: string;
  worktreeRoot: string;
  branchPattern: string;
  maxConcurrentAgents: number;
  stopAgentsOnExit: boolean;
  autoResumeAgents: boolean;
  notifications: NotificationSettings;
}
```

Add to the `AppConfig` interface:

```ts
  factory: FactorySettings;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test:web -- api.test`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/api.ts web/api.test.ts
git commit -m "feat(factory): frontend FactorySettings types"
```

---

## Task 5: Settings → Agents tab (React, TDD)

**Files:**
- Create: `web/components/AgentSettings.tsx`, `web/components/AgentSettings.test.tsx`
- Modify: `web/components/SettingsPage.tsx`

**Interfaces:**
- Consumes: `FactorySettings`, and an `onChange(next: FactorySettings)` callback owned by `SettingsPage` (so save flows through the existing draft/`save()` path).
- Produces: `export function AgentSettings({ value, onChange }: { value: FactorySettings; onChange: (v: FactorySettings) => void })`.

- [ ] **Step 1: Write the failing component test**

`web/components/AgentSettings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AgentSettings } from "./AgentSettings.tsx";
import type { FactorySettings } from "../api.ts";

const base: FactorySettings = {
  agentCommand: "claude",
  agentModel: "",
  permissionMode: "default",
  defaultBaseBranch: "",
  worktreeRoot: "",
  branchPattern: "feat/{feature}-{task}",
  maxConcurrentAgents: 4,
  stopAgentsOnExit: true,
  autoResumeAgents: false,
  notifications: { enabled: true, events: ["needsApproval", "failed"] },
};

describe("AgentSettings", () => {
  it("renders current values", () => {
    render(<AgentSettings value={base} onChange={() => {}} />);
    expect(screen.getByLabelText(/agent command/i)).toHaveValue("claude");
    expect(screen.getByLabelText(/max concurrent agents/i)).toHaveValue(4);
  });

  it("emits onChange when the agent command is edited", async () => {
    const onChange = vi.fn();
    render(<AgentSettings value={base} onChange={onChange} />);
    const input = screen.getByLabelText(/agent command/i);
    await userEvent.clear(input);
    await userEvent.type(input, "x");
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as FactorySettings;
    expect(last.agentCommand).toBe("x");
  });

  it("toggles stop-on-exit", async () => {
    const onChange = vi.fn();
    render(<AgentSettings value={base} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText(/stop agents on exit/i));
    expect(onChange.mock.calls.at(-1)![0].stopAgentsOnExit).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:web -- AgentSettings`
Expected: FAIL — cannot resolve `./AgentSettings.tsx`.

- [ ] **Step 3: Implement `AgentSettings.tsx`**

Use native controls with associated `<label htmlFor>` so `getByLabelText` works. (shadcn `Input`/`Switch` are fine; ensure ids match.)

```tsx
import type { FactorySettings } from "../api.ts";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AgentSettings({
  value,
  onChange,
}: {
  value: FactorySettings;
  onChange: (v: FactorySettings) => void;
}) {
  const set = <K extends keyof FactorySettings>(k: K, v: FactorySettings[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent factory</CardTitle>
        <CardDescription>
          How Kablan launches and manages Task Force agents. Applies to newly started agents.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-cmd">Agent command</Label>
          <Input id="af-cmd" value={value.agentCommand} spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("agentCommand", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-model">Default model</Label>
          <Input id="af-model" value={value.agentModel} placeholder="(agent default)"
            spellCheck={false} className="font-mono text-xs"
            onChange={(e) => set("agentModel", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-base">Default base branch</Label>
          <Input id="af-base" value={value.defaultBaseBranch} placeholder="(repo default)"
            spellCheck={false} className="font-mono text-xs"
            onChange={(e) => set("defaultBaseBranch", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-pattern">Branch naming pattern</Label>
          <Input id="af-pattern" value={value.branchPattern} spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("branchPattern", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-root">Worktree root</Label>
          <Input id="af-root" value={value.worktreeRoot} placeholder="(alongside repo)"
            spellCheck={false} className="font-mono text-xs"
            onChange={(e) => set("worktreeRoot", e.target.value)} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="af-max">Max concurrent agents</Label>
          <Input id="af-max" type="number" min={1} max={64} value={value.maxConcurrentAgents}
            className="w-24"
            onChange={(e) => set("maxConcurrentAgents", Number(e.target.value) || 1)} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="af-stop">Stop agents on exit</Label>
          <Switch id="af-stop" checked={value.stopAgentsOnExit}
            onCheckedChange={(v) => set("stopAgentsOnExit", v)} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="af-resume">Auto-resume on relaunch</Label>
          <Switch id="af-resume" checked={value.autoResumeAgents}
            onCheckedChange={(v) => set("autoResumeAgents", v)} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="af-notif">Desktop notifications</Label>
          <Switch id="af-notif" checked={value.notifications.enabled}
            onCheckedChange={(v) => set("notifications", { ...value.notifications, enabled: v })} />
        </div>
      </CardContent>
    </Card>
  );
}
```

Note: if shadcn `Switch` does not forward `id` to a labelable element, the test's `getByLabelText` on the switch may fail; in that case wrap each switch row in `<label>` instead of `htmlFor`. Verify against `web/components/ui/switch.tsx` during implementation.

- [ ] **Step 4: Wire it into `SettingsPage.tsx`**

Add the import:

```tsx
import { AgentSettings } from "./AgentSettings.tsx";
```

Add a tab trigger (after the `integrations` trigger):

```tsx
            <TabsTrigger value="agents">Agents</TabsTrigger>
```

Add the tab content (a sibling `TabsContent`, mirroring the others):

```tsx
            <TabsContent value="agents" className="mt-0 flex flex-col gap-6">
              <AgentSettings value={draft.factory} onChange={(f) => set("factory", f)} />
            </TabsContent>
```

Add `factory: draft.factory` to the `api.updateConfig({...})` object inside `save()`:

```tsx
        factory: draft.factory,
```

- [ ] **Step 5: Run tests, typecheck, build**

Run: `npm run test:web -- AgentSettings`
Expected: PASS (3 tests).
Run: `npx tsc --noEmit -p . && npm run build`
Expected: no type errors, successful build.

- [ ] **Step 6: Commit**

```bash
git add web/components/AgentSettings.tsx web/components/AgentSettings.test.tsx web/components/SettingsPage.tsx
git commit -m "feat(factory): Settings → Agents tab (TDD)"
```

---

## Verification (whole plan)

- `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features config::tests` → all config tests pass.
- `npm run test:web` → all frontend tests pass; server tests untouched.
- `npm run test:server:rust` → `# fail 0` (parity intact).
- `npx tsc --noEmit -p . && npm run build` → clean.
- Manual: Settings → Agents shows every field; editing + Save persists to `~/.kablan/config.json` under `"factory"`.

---

## Roadmap — subsequent plans

Each is its own spec-derived plan, executed in order; each ends with working, tested software.

- **Plan 02 — Factory store + worktree lifecycle.** `factory.rs`: `FactoryStore` (features/task forces CRUD + persistence to `~/.kablan/factory.json` + git-worktree reconcile); create-new (branch + `git worktree add` off base, branch-pattern from config) and delete/cleanup; HTTP endpoints `GET/POST /api/projects/:name/factory[...]`. Rust unit tests over a temp git repo. **No agent yet** — task forces exist as worktrees.
- **Plan 03 — Agent supervisor.** Owns a Claude Code agent per task force via the Agent SDK (`stream-json`), relays over WS, forwards input + permission decisions, lifecycle (spawn/stop/resume) honoring the config from Plan 01. **Prerequisite:** verify the live Agent SDK `stream-json` event schema before writing supervisor code (spec open question). TDD against a mock stream-json agent fixture.
- **Plan 04 — Cockpit UI.** Nested sidebar (Features + Branches sections), Feature rollup page, the 2-pane Task Force cockpit (chat + inline approvals + reused assets rail), create dialog. TDD with Vitest/RTL + a mock WebSocket.
- **Plan 05 — Attention engine + inbox + notifications.** Event→status mapping, unread cursors, Feature→Project→global aggregation, global inbox view, Tauri desktop notifications (gated by Plan 01 settings). TDD event mapping in Rust; inbox UI in RTL.
