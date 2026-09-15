import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Group,
  Panel,
  useDefaultLayout,
  type PanelSize,
} from 'react-resizable-panels';
import { ArrowUpRight, Loader2, Search, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/dialogs';
import {
  LinearFilterChips,
  LinearFilterMenu,
} from '@/components/integrations/LinearFilterMenu';
import { LinearIssueDetailsPanel } from '@/components/integrations/LinearIssueDetailsPanel';
import { IntegrationIcon } from '@/components/integrations/IntegrationIcon';
import { LinearStatusBadge } from '@/components/integrations/LinearStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useConfiguredIntegrations } from '@/hooks/useConfiguredIntegrations';
import { useAllTasks } from '@/hooks/useAllTasks';
import {
  useInvalidateLinearQueries,
  useLinearIssuesInfinite,
  useLinearMeta,
} from '@/hooks/useLinearIssues';
import { ApiError, linearApi } from '@/lib/api';
import { openTaskForm } from '@/lib/openTaskForm';
import {
  assigneeFilterLabel,
  DEFAULT_LINEAR_FILTERS,
  type LinearFilters,
} from '@/lib/integrations/linearFilters';
import {
  issueToTaskDraft,
  type IntegrationIssue,
} from '@/lib/integrations/linear';
import { integrationLabel } from '@/lib/integrations/catalog';
import {
  ADD_INTEGRATION_PATH,
  parseIntegrationParam,
} from '@/lib/routes/integrationRoutes';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { relativeDay, usesHour12 } from '@/utils/relativeDay';
import {
  COLLAPSED_SIZE,
  MIN_PANEL_SIZE,
  PanelResizeHandle,
} from '@/components/layout/PanelResizeHandle';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { IntegrationProvider } from 'shared/types';

export function IntegrationPage() {
  const { provider: raw } = useParams<{ provider: string }>();
  const provider = parseIntegrationParam(raw);
  const { isConnected } = useConfiguredIntegrations();

  if (!provider) {
    return <Navigate to={ADD_INTEGRATION_PATH} replace />;
  }

  if (provider !== IntegrationProvider.LINEAR) {
    return (
      <div className="mx-auto max-w-lg space-y-2 p-6">
        <h1 className="text-xl font-semibold">{integrationLabel(provider)}</h1>
        <p className="text-sm text-muted-foreground">
          This integration is not available yet.
        </p>
      </div>
    );
  }

  if (!isConnected(provider)) {
    return <ConnectLinearEmpty />;
  }

  return <LinearInbox />;
}

function ConnectLinearEmpty() {
  const { removeIntegration } = useConfiguredIntegrations();
  const { reloadSystem } = useUserSystem();
  const invalidateLinear = useInvalidateLinearQueries();
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      await linearApi.connect(apiKey.trim());
      await invalidateLinear();
      await reloadSystem();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not connect to Linear';
      setError(message);
      setConnecting(false);
    }
  };

  const handleRemove = async () => {
    try {
      const result = await ConfirmDialog.show({
        title: 'Remove Linear?',
        message:
          'Linear will leave the sidebar. You can add it again from Integrations.',
        confirmText: 'Remove',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (result !== 'confirmed') return;
    } catch {
      return;
    }
    await removeIntegration(IntegrationProvider.LINEAR);
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6 pt-2">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <IntegrationIcon
            provider={IntegrationProvider.LINEAR}
            className="h-5 w-5"
          />
          <h1 className="text-xl font-semibold">Linear</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect with a personal API key. Assigned issues will show here, and
          you can start any of them as a Kablan task.
        </p>
      </div>

      <ol className="space-y-4">
        <li className="flex items-start gap-3">
          <Step n="1" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm font-medium">Create a personal API key</p>
            <p className="text-sm text-muted-foreground">
              In Linear, open Settings → API → Personal API keys and create one.{' '}
              <a
                href="https://linear.app/settings/account/security/api-keys/new"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Open Linear API keys
              </a>
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Step n="2" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm font-medium">Paste the key</p>
            <Input
              type="password"
              autoComplete="off"
              placeholder="lin_api_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              aria-label="Linear API key"
            />
            <p className="text-xs text-muted-foreground">
              Stored locally in config.json, like your GitHub token.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Step n="3" active={connecting} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm font-medium">Connect</p>
            <p className="text-sm text-muted-foreground">
              We’ll validate the key and fetch issues assigned to you.
            </p>
          </div>
        </li>
      </ol>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button
          disabled={!apiKey.trim() || connecting}
          onClick={() => void handleConnect()}
        >
          {connecting ? 'Connecting…' : 'Connect'}
        </Button>
        <Button variant="ghost" onClick={() => void handleRemove()}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function Step({ n, active }: { n: string; active?: boolean }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {active ? <Loader2 className="h-3 w-3 animate-spin" /> : n}
    </span>
  );
}

function LinearInbox() {
  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'linearInbox-detail',
    storage: localStorage,
  });
  const [isInboxCollapsed, setIsInboxCollapsed] = useState(false);
  const [filters, setFilters] = useState<LinearFilters>(DEFAULT_LINEAR_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { config } = useUserSystem();
  const hour12 = usesHour12(config?.time_format);
  const { tasks } = useAllTasks();
  const metaQuery = useLinearMeta(true);
  const issuesQuery = useLinearIssuesInfinite(filters, true);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchInput.trim();
      setFilters((prev) => (prev.q === next ? prev : { ...prev, q: next }));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const issues = issuesQuery.data?.issues ?? [];
  const viewerName =
    issuesQuery.data?.viewer?.name ?? metaQuery.data?.viewer.name ?? null;
  const viewerId =
    metaQuery.data?.viewer.id ?? issuesQuery.data?.viewer?.id ?? null;
  const states = metaQuery.data?.states ?? [];
  const teams = metaQuery.data?.teams ?? [];
  const users = metaQuery.data?.users ?? [];

  const loading = issuesQuery.isLoading || metaQuery.isLoading;
  const searching = filters.q.length > 0 && issuesQuery.isFetching;
  const loadError =
    (issuesQuery.error instanceof ApiError
      ? issuesQuery.error.message
      : issuesQuery.error instanceof Error
        ? issuesQuery.error.message
        : null) ??
    (metaQuery.error instanceof ApiError
      ? metaQuery.error.message
      : metaQuery.error instanceof Error
        ? metaQuery.error.message
        : null);

  const selected = selectedId
    ? issues.find((issue) => issue.id === selectedId)
    : undefined;

  useEffect(() => {
    if (issues.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!issues.some((issue) => issue.id === selectedId)) {
      setSelectedId(issues[0].id);
    }
  }, [issues, selectedId]);

  const listRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const root = listRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          issuesQuery.hasNextPage &&
          !issuesQuery.isFetchingNextPage
        ) {
          void issuesQuery.fetchNextPage();
        }
      },
      { root, rootMargin: '120px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    issuesQuery.hasNextPage,
    issuesQuery.isFetchingNextPage,
    issuesQuery.fetchNextPage,
    issues.length,
  ]);

  const existing = selected
    ? tasks.find(
        (task) =>
          task.source_provider === 'linear' && task.source_id === selected.id
      )
    : undefined;

  const taskCount =
    issuesQuery.data?.totalCount && issuesQuery.data.totalCount > 0
      ? issuesQuery.data.totalCount
      : issues.length;

  const handleInboxResize = (size: PanelSize) => {
    setIsInboxCollapsed(size.asPercentage === COLLAPSED_SIZE);
  };

  return (
    <Group
      orientation="horizontal"
      className="h-full min-h-0"
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
    >
      <Panel
        id="inbox"
        defaultSize={40}
        minSize={MIN_PANEL_SIZE}
        collapsible
        collapsedSize={COLLAPSED_SIZE}
        onResize={handleInboxResize}
        className="min-w-0 min-h-0 overflow-hidden"
        role="region"
        aria-label="Linear inbox"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <IntegrationIcon
              provider={IntegrationProvider.LINEAR}
              className="h-4 w-4"
            />
            <h1 className="text-sm font-semibold">Linear</h1>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {assigneeFilterLabel(filters.assignee, users)}
            </span>
            <LinearFilterMenu
              value={filters}
              onChange={setFilters}
              states={states}
              teams={teams}
              users={users}
              viewerId={viewerId}
            />
          </div>
          <div className="border-b px-3 py-2">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search issues…"
                className="h-8 pl-8 pr-8 text-sm"
                aria-label="Search Linear issues"
              />
              {(searchInput || searching) && (
                <button
                  type="button"
                  className="absolute right-2 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  aria-label={searching ? 'Searching' : 'Clear search'}
                  onClick={() => {
                    if (searching && !searchInput) return;
                    setSearchInput('');
                    setFilters((prev) => (prev.q ? { ...prev, q: '' } : prev));
                  }}
                >
                  {searching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </label>
          </div>
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {loading
                ? 'Loading…'
                : `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`}
            </span>
            <LinearFilterChips
              value={filters}
              onChange={(next) => {
                setFilters(next);
                if (next.q !== filters.q) setSearchInput(next.q);
              }}
              teams={teams}
              users={users}
            />
          </div>
          <ul ref={listRef} className="min-h-0 flex-1 overflow-auto p-2">
            {loadError ? (
              <li className="px-2 py-6 text-center text-sm text-destructive">
                {loadError}
              </li>
            ) : loading ? (
              <li className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Fetching issues…
              </li>
            ) : issues.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                No tickets match these filters.
              </li>
            ) : (
              <>
                {issues.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    selected={issue.id === selectedId}
                    hour12={hour12}
                    viewerName={viewerName}
                    onSelect={() => setSelectedId(issue.id)}
                  />
                ))}
                <li ref={sentinelRef} className="h-4" aria-hidden />
                {issuesQuery.isFetchingNextPage && (
                  <li className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading more…
                  </li>
                )}
              </>
            )}
          </ul>
        </div>
      </Panel>

      <PanelResizeHandle
        id="handle-linear-inbox"
        collapsed={isInboxCollapsed}
      />

      <Panel
        id="detail"
        defaultSize={60}
        minSize={MIN_PANEL_SIZE}
        className="min-w-0 min-h-0 overflow-hidden"
        role="region"
        aria-label="Ticket"
      >
        <div className="flex h-full min-w-0 min-h-0">
          <div className="min-w-0 flex-1 overflow-auto p-6">
            {selected ? (
              <IssueDetail
                issue={selected}
                existingTask={existing}
                hour12={hour12}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {loading ? 'Loading…' : 'Pick a ticket.'}
              </p>
            )}
          </div>
          {selected && (
            <div className="hidden w-[min(100%,18rem)] shrink-0 md:block">
              <LinearIssueDetailsPanel issue={selected} hour12={hour12} />
            </div>
          )}
        </div>
      </Panel>
    </Group>
  );
}

function IssueRow({
  issue,
  selected,
  hour12,
  viewerName,
  onSelect,
}: {
  issue: IntegrationIssue;
  selected: boolean;
  hour12: boolean;
  viewerName: string | null;
  onSelect: () => void;
}) {
  const showAssignee =
    issue.assignee !== null &&
    issue.assignee !== 'You' &&
    issue.assignee !== viewerName;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full rounded-lg p-2.5 text-left transition-colors hover:bg-muted',
          selected && 'bg-muted'
        )}
      >
        <div className="flex items-center gap-2">
          <span className="font-ibm-plex-mono text-[11px] text-muted-foreground">
            {issue.identifier}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {issue.title}
          </span>
          <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
            {relativeDay(issue.updatedAt, hour12)}
          </span>
        </div>
        <div className="mt-[5px] flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>{issue.team}</span>
          <span>·</span>
          <LinearStatusBadge
            name={issue.status}
            type={issue.statusType}
            color={issue.statusColor}
          />
          {showAssignee && (
            <>
              <span>·</span>
              <span className="truncate">{issue.assignee}</span>
            </>
          )}
          {issue.assignee === null && (
            <>
              <span>·</span>
              <span>Unassigned</span>
            </>
          )}
        </div>
      </button>
    </li>
  );
}

function IssueDetail({
  issue,
  existingTask,
  hour12,
}: {
  issue: IntegrationIssue;
  existingTask?: { id: string; projectId: string };
  hour12: boolean;
}) {
  const draft = issueToTaskDraft(issue);

  const handleStart = () => {
    void openTaskForm({
      mode: 'create',
      initialTitle: draft.title,
      initialDescription: draft.description,
      source: draft.source,
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-2">
        <span className="font-ibm-plex-mono text-xs text-muted-foreground">
          {issue.identifier}
        </span>
        <h2 className="text-xl font-semibold">{issue.title}</h2>
      </div>
      {issue.description.trim() ? (
        <div className="text-sm leading-6 text-muted-foreground [&_img]:max-w-full [&_img]:rounded-md [&_img]:border">
          <WYSIWYGEditor value={issue.description} disabled />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
      <div className="flex items-center gap-2">
        {existingTask ? (
          <Button asChild>
            <Link to={paths.task(existingTask.projectId, existingTask.id)}>
              Open task
            </Link>
          </Button>
        ) : (
          <Button onClick={handleStart}>Start as task</Button>
        )}
        <Button variant="ghost" asChild>
          <a href={issue.url} target="_blank" rel="noreferrer">
            Open in Linear
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
      {issue.comments.length > 0 && (
        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">
            Comments
            <span className="ml-2 font-normal text-muted-foreground">
              {issue.comments.length}
            </span>
          </h3>
          <ul className="space-y-4">
            {issue.comments.map((comment) => (
              <li
                key={comment.id}
                className="space-y-1.5 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {comment.author ?? 'Unknown'}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {relativeDay(comment.createdAt, hour12)}
                  </span>
                </div>
                <div className="text-sm leading-6 [&_img]:max-w-full [&_img]:rounded-md [&_img]:border">
                  <WYSIWYGEditor value={comment.body} disabled />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
