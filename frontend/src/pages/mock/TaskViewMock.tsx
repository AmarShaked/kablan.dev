import { useState } from 'react';
import {
  ArrowUpRight, Check, CircleDashed, Clock, Copy, Dot,
  ExternalLink, FileDiff, GitBranch, Loader2, MoreHorizontal, Paperclip,
  Play, SlidersHorizontal, Square, SquareTerminal, Star, User, X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * MOCK ONLY — /mock/task
 *
 * The three-column task view: every task on the left, the agent conversation in the middle, the
 * task's properties on the right. Hardcoded; nothing talks to the API.
 *
 * The left column is modelled on Linear's inbox: each row carries a state glyph, the title, a
 * line describing the most recent activity, and how long ago it happened — enough to triage
 * without opening anything.
 */

type State = 'todo' | 'running' | 'review' | 'done' | 'cancelled';

type MockTask = {
  id: string;
  ref: string;
  title: string;
  activity: string;
  when: string;
  state: State;
  unread?: boolean;
  server?: boolean;
};

const TASKS: MockTask[] = [
  { id: 't1', ref: 'KAB-41', title: 'Wire the projects list to real data', activity: 'Agent finished · 7 files changed', when: '2m', state: 'review', unread: true },
  { id: 't2', ref: 'KAB-40', title: 'Sensor deployment — change text to Argo CD', activity: 'Agent is editing SupportedAgentsSection.tsx', when: '20s', state: 'running', unread: true, server: true },
  { id: 't3', ref: 'KAB-39', title: 'Add an icon picker to projects', activity: 'You approved a tool call', when: '1h', state: 'running' },
  { id: 't4', ref: 'KAB-38', title: 'Remove the embedded browser', activity: 'Merged into main', when: '20h', state: 'done' },
  { id: 't5', ref: 'KAB-37', title: 'Auto-fetch repositories on a timer', activity: 'You cancelled the attempt', when: '2d', state: 'cancelled' },
  { id: 't6', ref: 'KAB-36', title: 'Empty states for tasks and projects', activity: 'Merged into main', when: '3d', state: 'done' },
];

function StateGlyph({ state }: { state: State }) {
  const common = 'h-3.5 w-3.5 shrink-0';
  if (state === 'running')
    return <Loader2 className={`${common} animate-spin text-info`} aria-label="Running" />;
  if (state === 'review')
    return <CircleDashed className={`${common} text-warning`} aria-label="In review" />;
  if (state === 'done')
    return <Check className={`${common} text-success`} aria-label="Done" />;
  if (state === 'cancelled')
    return <X className={`${common} text-muted-foreground`} aria-label="Cancelled" />;
  return <CircleDashed className={`${common} text-muted-foreground`} aria-label="To do" />;
}

/** One row in the left column. */
function TaskRow({
  task, selected, onSelect,
}: { task: MockTask; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        selected ? 'bg-accent' : ''
      }`}
    >
      <span className="mt-0.5 flex w-3 shrink-0 justify-center">
        {task.unread ? (
          <Dot className="h-4 w-4 -m-1 text-info" aria-label="Unread" />
        ) : null}
      </span>

      <span className="mt-0.5">
        <StateGlyph state={task.state} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="font-ibm-plex-mono shrink-0 text-[10px] tracking-wide text-muted-foreground">
            {task.ref}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {task.activity}
          </span>
          {task.server && (
            <SquareTerminal className="h-3 w-3 shrink-0 text-success" aria-label="Dev server running" />
          )}
          <span className="font-ibm-plex-mono shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {task.when}
          </span>
        </span>
      </span>
    </button>
  );
}

/** A labelled row in the right-hand properties column. */
function Prop({
  icon: Icon, label, value, muted,
}: { icon: typeof User; label: string; value: string; muted?: boolean }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className={muted ? 'text-muted-foreground' : ''}>{value}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-ibm-plex-mono px-2 pb-1 pt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

export function TaskViewMock() {
  const [selectedId, setSelectedId] = useState('t2');
  const task = TASKS.find((t) => t.id === selectedId)!;

  return (
    <div className="flex h-full min-h-0">
      {/* ---------------- left: every task ---------------- */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="font-medium">Tasks</span>
          <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
            {TASKS.length}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button className="p-1 text-muted-foreground hover:text-foreground" aria-label="Filter">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            <button className="p-1 text-muted-foreground hover:text-foreground" aria-label="More">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {TASKS.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              selected={t.id === selectedId}
              onSelect={() => setSelectedId(t.id)}
            />
          ))}
        </div>
      </aside>

      {/* ---------------- centre: the agent conversation ---------------- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <span className="font-ibm-plex-mono text-[11px] text-muted-foreground">
            {task.ref}
          </span>
          <span className="min-w-0 truncate font-medium">{task.title}</span>
          <span className="ml-auto flex items-center gap-1">
            <button className="p-1 text-muted-foreground hover:text-foreground" aria-label="Star">
              <Star className="h-4 w-4" />
            </button>
            <button className="p-1 text-muted-foreground hover:text-foreground" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <div className="max-w-2xl">
            <p className="font-ibm-plex-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              You
            </p>
            <p className="mt-1 text-sm">
              Change the installation method label from “Argocd” to “Argo CD”.
            </p>
          </div>

          <div className="max-w-2xl">
            <p className="font-ibm-plex-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Claude Code
            </p>
            <p className="mt-1 text-sm">
              I&apos;ll search for “Argocd” and replace it with “Argo CD”.
            </p>
            <div className="mt-2 space-y-1">
              {[
                'Grep  “Argocd”',
                'Read  src/components/HeroSection.jsx',
                'Edit  src/components/HeroSection.jsx  +2 −2',
                'Edit  src/components/SupportedAgentsSection.jsx  +9 −1',
              ].map((line) => (
                <p
                  key={line}
                  className="font-ibm-plex-mono border-l-2 border-border py-0.5 pl-2 text-xs text-muted-foreground"
                >
                  {line}
                </p>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-info" />
              Working…
            </p>
          </div>
        </div>

        <div className="border-t border-border p-3">
          <div className="border border-input">
            <textarea
              rows={2}
              placeholder="Message the agent…"
              className="w-full resize-none bg-transparent p-3 text-sm outline-none"
            />
            <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
              <button className="p-1 text-muted-foreground hover:text-foreground" aria-label="Attach">
                <Paperclip className="h-4 w-4" />
              </button>
              <span className="font-ibm-plex-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Claude Code · Accept edits
              </span>
              <span className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Square className="mr-1.5 h-3 w-3" />
                  Stop
                </Button>
                <Button size="sm">Send</Button>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ---------------- right: the attempt's real actions and settings ----------------
          Labels and actions are taken from what the app actually offers for an attempt
          (attempt history, agent, branch/base, worktree path, dev server, git actions,
          diffs, subtasks) rather than invented ones. */}
      <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-border p-2">
        <SectionLabel>Attempt</SectionLabel>
        <Prop icon={Play} label="Attempt" value="Attempt 2 of 2" />
        <Prop icon={Clock} label="Attempt history" value="View attempt history" muted />
        <Prop icon={User} label="Agent" value="Claude Code · Sonnet" />
        <div className="flex gap-1 px-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1">
            <Square className="mr-1.5 h-3 w-3" />
            Stop Attempt
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            Try Again
          </Button>
        </div>
        <div className="px-2 pt-1">
          <Button variant="outline" size="sm" className="w-full">
            New Attempt
          </Button>
        </div>

        <SectionLabel>Workspace</SectionLabel>
        <Prop icon={GitBranch} label="Task branch" value="kablan/7b7c-argo-cd" />
        <Prop icon={GitBranch} label="Base branch" value="main" muted />
        <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent">
          <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-ibm-plex-mono text-xs text-muted-foreground">
            ~/.kablan-workspaces/kablan-app-7b7c
          </span>
        </button>
        <Prop icon={ExternalLink} label="Open in IDE" value="Open in IDE" muted />

        <SectionLabel>Dev server</SectionLabel>
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
          <SquareTerminal className="h-3.5 w-3.5 shrink-0 text-success" />
          <span className="min-w-0 truncate font-ibm-plex-mono text-xs">
            http://localhost:3000
          </span>
        </div>
        <div className="flex gap-1 px-2">
          <Button variant="outline" size="sm" className="flex-1">
            Stop Dev
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            Dev logs
          </Button>
        </div>

        <SectionLabel>Changes</SectionLabel>
        <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent">
          <FileDiff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>Diffs · 2 files</span>
          <span className="font-ibm-plex-mono ml-auto text-xs tabular-nums">
            <span className="text-success">+11</span>{' '}
            <span className="text-destructive">−3</span>
          </span>
        </button>

        <SectionLabel>Git actions</SectionLabel>
        <p className="font-ibm-plex-mono px-2 pb-1 text-[11px] text-muted-foreground">
          +2 commits ahead · up to date with main
        </p>
        <div className="grid grid-cols-2 gap-1 px-2">
          <Button variant="outline" size="sm">Merge</Button>
          <Button variant="outline" size="sm">Rebase</Button>
          <Button variant="outline" size="sm">Push</Button>
          <Button variant="outline" size="sm">Create PR</Button>
        </div>

        <SectionLabel>Task</SectionLabel>
        <Prop icon={ArrowUpRight} label="Create subtask" value="Create Subtask" muted />
      </aside>
    </div>
  );
}
