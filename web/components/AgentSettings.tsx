import { useEffect, useState } from "react";
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
  // Local echo of `value` so the fields stay responsive to typing on every
  // keystroke: a React controlled input whose `value` prop never changes
  // (e.g. a parent that doesn't feed the new value back synchronously) would
  // otherwise appear frozen, since React resets the DOM to the last-rendered
  // `value` right after each input event. Keeping a local copy — kept in
  // sync when the parent's `value` changes out from under us (reset, reload,
  // switching tabs) — avoids that while still funneling every edit through
  // `onChange` for the parent's draft/save flow.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const set = <K extends keyof FactorySettings>(k: K, v: FactorySettings[K]) => {
    const next = { ...local, [k]: v };
    setLocal(next);
    onChange(next);
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
            value={local.agentCommand}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("agentCommand", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-model">Default model</Label>
          <Input
            id="af-model"
            value={local.agentModel}
            placeholder="(agent default)"
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("agentModel", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-base">Default base branch</Label>
          <Input
            id="af-base"
            value={local.defaultBaseBranch}
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
            value={local.branchPattern}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("branchPattern", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="af-root">Worktree root</Label>
          <Input
            id="af-root"
            value={local.worktreeRoot}
            placeholder="(alongside repo)"
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => set("worktreeRoot", e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="af-max">Max concurrent agents</Label>
          <Input
            id="af-max"
            type="number"
            min={1}
            max={64}
            value={local.maxConcurrentAgents}
            className="w-24"
            onChange={(e) => set("maxConcurrentAgents", Number(e.target.value) || 1)}
          />
        </div>
        <label className="flex items-center justify-between" htmlFor="af-stop">
          <span className="text-sm leading-none font-medium select-none">Stop agents on exit</span>
          <Switch
            id="af-stop"
            checked={local.stopAgentsOnExit}
            onCheckedChange={(v) => set("stopAgentsOnExit", v)}
          />
        </label>
        <label className="flex items-center justify-between" htmlFor="af-resume">
          <span className="text-sm leading-none font-medium select-none">Auto-resume on relaunch</span>
          <Switch
            id="af-resume"
            checked={local.autoResumeAgents}
            onCheckedChange={(v) => set("autoResumeAgents", v)}
          />
        </label>
        <label className="flex items-center justify-between" htmlFor="af-notif">
          <span className="text-sm leading-none font-medium select-none">Desktop notifications</span>
          <Switch
            id="af-notif"
            checked={local.notifications.enabled}
            onCheckedChange={(v) => set("notifications", { ...local.notifications, enabled: v })}
          />
        </label>
      </CardContent>
    </Card>
  );
}
