import type { FactorySettings } from "../api.ts";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SETTINGS_PERMISSION_OPTIONS } from "../lib/permissions.ts";

const NOTIFIABLE_EVENTS = [
  { key: "awaitingInput", label: "Awaiting input" },
  { key: "failed", label: "Failed" },
  { key: "done", label: "Done" },
] as const;

export function AgentSettings({
  value,
  onChange,
}: {
  value: FactorySettings;
  onChange: (v: FactorySettings) => void;
}) {
  const set = <K extends keyof FactorySettings>(k: K, v: FactorySettings[K]) => {
    onChange({ ...value, [k]: v });
  };

  const toggleEvent = (event: string, checked: boolean) => {
    const events = checked
      ? [...value.notifications.events, event]
      : value.notifications.events.filter((e) => e !== event);
    onChange({ ...value, notifications: { ...value.notifications, events } });
  };

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
          <Input
            id="af-cmd"
            value={value.agentCommand}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("agentCommand", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-model">Default model</Label>
          <Input
            id="af-model"
            value={value.agentModel}
            placeholder="(agent default)"
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("agentModel", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-perm">Permission mode</Label>
          <Select
            value={value.permissionMode}
            onValueChange={(v) => set("permissionMode", v as FactorySettings["permissionMode"])}
          >
            <SelectTrigger id="af-perm" aria-label="Permission mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SETTINGS_PERMISSION_OPTIONS.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-base">Default base branch</Label>
          <Input
            id="af-base"
            value={value.defaultBaseBranch}
            placeholder="(repo default)"
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("defaultBaseBranch", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-pattern">Branch naming pattern</Label>
          <Input
            id="af-pattern"
            value={value.branchPattern}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("branchPattern", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-root">Worktree root</Label>
          <Input
            id="af-root"
            value={value.worktreeRoot}
            placeholder="(alongside repo)"
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("worktreeRoot", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-mcp">MCP config path (optional)</Label>
          <Input
            id="af-mcp"
            value={value.mcpConfigPath}
            placeholder="(none)"
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("mcpConfigPath", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Path to an .mcp.json to load extra MCP servers for cockpit agents (they'll go through
            Approve/Deny).
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="af-max">Max concurrent agents</Label>
          <Input
            id="af-max"
            type="number"
            min={1}
            max={64}
            value={value.maxConcurrentAgents}
            className="w-24"
            onChange={(e) => set("maxConcurrentAgents", Number(e.target.value) || 1)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="af-history">Keep chat history (days, 0 = forever)</Label>
          <Input
            id="af-history"
            type="number"
            min={0}
            max={3650}
            value={value.chatHistoryDays}
            className="w-24"
            onChange={(e) => set("chatHistoryDays", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
        </div>
        <label className="flex items-center justify-between" htmlFor="af-stop">
          <span className="text-sm leading-none font-medium select-none">Stop agents on exit</span>
          <Switch
            id="af-stop"
            checked={value.stopAgentsOnExit}
            onCheckedChange={(v) => set("stopAgentsOnExit", v)}
          />
        </label>
        <label className="flex items-center justify-between" htmlFor="af-resume">
          <span className="text-sm leading-none font-medium select-none">Auto-resume on relaunch</span>
          <Switch
            id="af-resume"
            checked={value.autoResumeAgents}
            onCheckedChange={(v) => set("autoResumeAgents", v)}
          />
        </label>
        <label className="flex items-center justify-between" htmlFor="af-notif">
          <span className="text-sm leading-none font-medium select-none">Desktop notifications</span>
          <Switch
            id="af-notif"
            checked={value.notifications.enabled}
            onCheckedChange={(v) => set("notifications", { ...value.notifications, enabled: v })}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium select-none">Notify on</span>
          <div className="flex flex-col gap-2">
            {NOTIFIABLE_EVENTS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2" htmlFor={`af-notif-${key}`}>
                <input
                  id={`af-notif-${key}`}
                  type="checkbox"
                  className="border-input h-4 w-4 rounded-sm border shadow-xs"
                  checked={value.notifications.events.includes(key)}
                  onChange={(e) => toggleEvent(key, e.target.checked)}
                />
                <span className="text-sm leading-none select-none">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
