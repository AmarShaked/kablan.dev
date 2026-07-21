import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Config location is overridable via KABLAN_CONFIG_DIR (used by tests for isolation).
const CONFIG_DIR = process.env.KABLAN_CONFIG_DIR || join(homedir(), ".kablan");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface ProjectOverride {
  /** Override the auto-detected dev command, e.g. "npm run dev". */
  devCommand?: string;
}

export interface AppConfig {
  /** Parent folder scanned for git repositories. */
  parentDir: string;
  /** How many folder levels deep to search for git repos (1 = direct children only). */
  maxScanDepth: number;
  /** Filenames surfaced in the Environment editor, in display order. */
  envFiles: string[];
  /** Ordered script names tried when auto-detecting a dev command. */
  devScriptPriority: string[];
  /** How many log lines to retain per server. */
  maxLogLines: number;
  /** Show git repos even when they have no package.json / dev command. */
  showNonNodeProjects: boolean;
  /** Linear workspace slug (the linear.app/<slug> part) for ticket links. Empty disables links. */
  linearWorkspace: string;
  /** Per-project settings, keyed by absolute project path. */
  overrides: Record<string, ProjectOverride>;
}

export const DEFAULT_CONFIG: AppConfig = {
  parentDir: join(homedir(), "Projects"),
  maxScanDepth: 3,
  envFiles: [".env", ".env.local", ".env.development", ".env.development.local"],
  devScriptPriority: ["dev", "start", "serve", "develop"],
  maxLogLines: 2000,
  showNonNodeProjects: true,
  linearWorkspace: "",
  overrides: {},
};

let cache: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cache) return cache;
  let config: AppConfig;
  if (!existsSync(CONFIG_PATH)) {
    config = { ...DEFAULT_CONFIG };
  } else {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      config = { ...DEFAULT_CONFIG, ...raw, overrides: raw.overrides ?? {} };
    } catch {
      config = { ...DEFAULT_CONFIG };
    }
  }
  cache = config;
  return config;
}

export function saveConfig(next: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const merged: AppConfig = {
    ...current,
    ...next,
    overrides: { ...current.overrides, ...(next.overrides ?? {}) },
  };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  cache = merged;
  return merged;
}

export function setOverride(projectPath: string, override: ProjectOverride): AppConfig {
  const current = loadConfig();
  return saveConfig({
    overrides: { ...current.overrides, [projectPath]: { ...current.overrides[projectPath], ...override } },
  });
}

export function clearOverride(projectPath: string): AppConfig {
  const current = loadConfig();
  const overrides = { ...current.overrides };
  delete overrides[projectPath];
  // Rewrite the whole overrides map (saveConfig merges, so build the full object).
  const merged: AppConfig = { ...current, overrides };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  cache = merged;
  return merged;
}
