import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X, RotateCcw, Save, RefreshCw, Link2 } from "lucide-react";
import { api, type AppConfig, type ProjectSummary } from "../api.ts";
import { GitLabLogo, LinearLogo } from "../lib/brandLogos.tsx";
import {
  APP_VERSION,
  checkForUpdate,
  checkTauriUpdate,
  isTauri,
  DOWNLOAD_URL,
} from "../lib/version.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function StringList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...values, ""])}>
        <Plus className="size-3.5" /> {placeholder}
      </Button>
    </div>
  );
}

export function SettingsPage({
  onClose,
  onConfigChanged,
  projects,
}: {
  onClose: () => void;
  onConfigChanged: () => void;
  projects: ProjectSummary[];
}) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const [glHosts, setGlHosts] = useState<string[]>([]);
  const [glHost, setGlHost] = useState("");
  const [glToken, setGlToken] = useState("");
  const [glBusy, setGlBusy] = useState(false);

  useEffect(() => {
    if (isTauri) api.gitlab.hosts().then((r) => setGlHosts(r.hosts)).catch(() => {});
  }, []);

  const glConnect = async () => {
    if (!glHost.trim() || !glToken.trim()) return;
    setGlBusy(true);
    try {
      const r = await api.gitlab.setToken(glHost.trim().toLowerCase(), glToken.trim());
      toast.success(`Connected to ${glHost} as ${r.username}`);
      setGlToken("");
      setGlHost("");
      setGlHosts((await api.gitlab.hosts()).hosts);
    } catch (err) {
      toast.error(`Couldn't connect: ${String(err)}`);
    } finally {
      setGlBusy(false);
    }
  };

  const glDisconnect = async (host: string) => {
    await api.gitlab.deleteToken(host).catch(() => {});
    setGlHosts((await api.gitlab.hosts()).hosts);
    toast.success(`Disconnected ${host}`);
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      if (isTauri) {
        const u = await checkTauriUpdate();
        if (u) {
          toast.success(`Update available: v${u.version}`, {
            duration: 12000,
            action: { label: "Update & restart", onClick: () => void u.run() },
          });
        } else {
          toast.success(`You're on the latest version (v${APP_VERSION}).`);
        }
      } else {
        const u = await checkForUpdate();
        if (u) {
          toast.success(`Update available: v${u.latest}`, {
            duration: 12000,
            action: { label: "Download", onClick: () => window.open(DOWNLOAD_URL, "_blank", "noopener") },
          });
        } else {
          toast.success(`You're on the latest version (v${APP_VERSION}).`);
        }
      }
    } catch (err) {
      toast.error(`Update check failed: ${String(err)}`);
    } finally {
      setChecking(false);
    }
  };

  const load = () => api.getConfig().then((c) => {
    setConfig(c);
    setDraft(c);
  });

  useEffect(() => {
    load();
  }, []);

  if (!draft || !config) {
    return <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>;
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setDraft({ ...draft, [key]: value });

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.updateConfig({
        parentDir: draft.parentDir.trim(),
        maxScanDepth: draft.maxScanDepth,
        envFiles: draft.envFiles.map((s) => s.trim()).filter(Boolean),
        devScriptPriority: draft.devScriptPriority.map((s) => s.trim()).filter(Boolean),
        maxLogLines: draft.maxLogLines,
        showNonNodeProjects: draft.showNonNodeProjects,
        linearWorkspace: draft.linearWorkspace.trim(),
      });
      setConfig(next);
      setDraft(next);
      onConfigChanged();
      toast.success("Settings saved");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      const next = await api.resetConfig();
      setConfig(next);
      setDraft(next);
      onConfigChanged();
      toast.success("Settings reset to defaults");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const clearOverride = async (name: string) => {
    try {
      await api.clearOverride(name);
      await load();
      onConfigChanged();
      toast.success(`Cleared override for ${name}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const overrideEntries = Object.entries(config.overrides).filter(
    ([, v]) => v.devCommand && v.devCommand.trim(),
  );
  const nameForPath = (p: string) => projects.find((pr) => pr.path === p)?.name ?? p.split("/").pop() ?? p;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="shrink-0" />
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">
              Stored at <code className="font-mono">~/.kablan/config.json</code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <RotateCcw className="size-4" /> Reset to defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset settings to defaults?</AlertDialogTitle>
                <AlertDialogDescription>
                  This restores the scanning folder, env files, detection order, and log settings to
                  their defaults. Your per-project command overrides are kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={reset}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            <Save className="size-4" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden gap-0">
        <div className="px-6 border-b border-border">
          <TabsList variant="line" className="h-11">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="detection">Detection &amp; Env</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="overrides">
              Project overrides {overrideEntries.length > 0 && `(${overrideEntries.length})`}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll">
          <div className="p-6 max-w-3xl flex flex-col gap-6">
            <TabsContent value="general" className="mt-0 flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Scanning folder</CardTitle>
                  <CardDescription>Parent directory scanned for git repositories.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Input
                    value={draft.parentDir}
                    spellCheck={false}
                    className="font-mono text-xs"
                    onChange={(e) => set("parentDir", e.target.value)}
                  />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Search depth</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        How many folder levels deep to look for git repos. Use 2–3 for grouping
                        folders like <code className="font-mono">acme/frontend/app</code>.
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={draft.maxScanDepth}
                      className="w-24"
                      onChange={(e) => set("maxScanDepth", Number(e.target.value) || 1)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Project list</CardTitle>
                  <CardDescription>Control which repos appear in the sidebar.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <Label>Show non-Node projects</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Include git repos without a <code className="font-mono">package.json</code>.
                    </p>
                  </div>
                  <Switch
                    checked={draft.showNonNodeProjects}
                    onCheckedChange={(v) => set("showNonNodeProjects", v)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Logs</CardTitle>
                  <CardDescription>How many log lines to retain per server in memory.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={100}
                    step={100}
                    value={draft.maxLogLines}
                    className="w-40"
                    onChange={(e) => set("maxLogLines", Number(e.target.value) || 0)}
                  />
                  <span className="text-xs text-muted-foreground">lines</span>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>About &amp; updates</CardTitle>
                  <CardDescription>
                    You're running Kablan.dev <code className="font-mono">v{APP_VERSION}</code>.
                    {isTauri
                      ? " Updates install in place — no re-download needed."
                      : " In the browser, updates open the download page."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" onClick={checkUpdates} disabled={checking}>
                    <RefreshCw className={checking ? "size-4 animate-spin" : "size-4"} />
                    {checking ? "Checking…" : "Check for updates"}
                  </Button>
                </CardContent>
              </Card>

            </TabsContent>

            <TabsContent value="integrations" className="mt-0 flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LinearLogo className="size-4 shrink-0" /> Linear
                  </CardTitle>
                  <CardDescription>
                    Workspace slug from your Linear URL (<code className="font-mono">linear.app/&lt;slug&gt;</code>).
                    When set, branches/worktrees with a ticket id (e.g. <code className="font-mono">FE-3146</code>)
                    show a link to Linear.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input
                    value={draft.linearWorkspace}
                    spellCheck={false}
                    placeholder="e.g. acme"
                    className="font-mono text-xs"
                    onChange={(e) => set("linearWorkspace", e.target.value)}
                  />
                </CardContent>
              </Card>

              {isTauri ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GitLabLogo className="size-4 shrink-0" /> GitLab
                    </CardTitle>
                    <CardDescription>
                      Connect a GitLab host to see Merge Request &amp; pipeline status and open MRs.
                      Use a Personal Access Token with the <code className="font-mono">api</code> scope
                      — it's stored in your OS keychain, never in this config.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {glHosts.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {glHosts.map((h) => (
                          <div key={h} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                            <Link2 className="size-4 text-muted-foreground" />
                            <span className="font-mono">{h}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto text-muted-foreground"
                              onClick={() => glDisconnect(h)}
                            >
                              <Trash2 className="size-4" /> Disconnect
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <Label>Add a host</Label>
                      <Input
                        value={glHost}
                        placeholder="gitlab.com or gitlab.mycompany.com"
                        spellCheck={false}
                        className="font-mono text-xs"
                        onChange={(e) => setGlHost(e.target.value)}
                      />
                      <Input
                        value={glToken}
                        type="password"
                        placeholder="Personal Access Token (api scope)"
                        spellCheck={false}
                        className="font-mono text-xs"
                        onChange={(e) => setGlToken(e.target.value)}
                      />
                      <Button size="sm" className="self-start" disabled={glBusy} onClick={glConnect}>
                        {glBusy ? "Connecting…" : "Test & connect"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GitLabLogo className="size-4 shrink-0" /> GitLab
                    </CardTitle>
                    <CardDescription>
                      GitLab integration (MR &amp; pipeline status, create MR) is available in the
                      desktop app, where the access token can be stored securely in your OS keychain.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="detection" className="mt-0 flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Environment files</CardTitle>
                  <CardDescription>
                    Filenames shown in each project's Environment editor, in order.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StringList
                    values={draft.envFiles}
                    onChange={(v) => set("envFiles", v)}
                    placeholder="Add env file"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dev command detection</CardTitle>
                  <CardDescription>
                    package.json script names tried in order when auto-detecting the dev command.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StringList
                    values={draft.devScriptPriority}
                    onChange={(v) => set("devScriptPriority", v)}
                    placeholder="Add script name"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="overrides" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Per-project command overrides</CardTitle>
                  <CardDescription>
                    Custom dev commands set from a project's Branches &amp; Worktrees tab.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {overrideEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No overrides set.</p>
                  ) : (
                    overrideEntries.map(([path, v], i) => (
                      <div key={path}>
                        {i > 0 && <Separator className="my-2" />}
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{nameForPath(path)}</div>
                            <div className="text-xs font-mono text-muted-foreground truncate">
                              {v.devCommand}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive shrink-0"
                            onClick={() => clearOverride(nameForPath(path))}
                          >
                            <Trash2 className="size-4" /> Clear
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </>
  );
}
