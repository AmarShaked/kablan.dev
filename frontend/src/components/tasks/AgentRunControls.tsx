import {
  Check,
  FilePen,
  ListTodo,
  Shield,
  ShieldOff,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { useQuery } from '@tanstack/react-query';
import {
  BaseCodingAgent,
  PermissionLevel,
  type AgentRunSelection,
  type ListedModel,
} from 'shared/types';
import { agentModelsApi } from '@/lib/api';
import { agentLabel } from '@/utils/agentLabels';
import {
  adjustModel,
  adjustPermission,
  hasMoreModels,
  permissionHint,
  permissionLabel,
  supportedPermissions,
} from '@/utils/agentRun';
import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const chipTriggerClass =
  'h-7 gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-xs font-normal text-foreground hover:bg-accent';

export function AgentRunControls({
  selection,
  onChange,
  agentFixed = false,
  disabled = false,
  variant = 'bar',
  showPermission = false,
}: {
  selection: AgentRunSelection;
  onChange: (next: AgentRunSelection) => void;
  /** Follow-ups keep the agent the task started with. */
  agentFixed?: boolean;
  disabled?: boolean;
  /** `chips` draws each control as a small pill under the input. */
  variant?: 'bar' | 'chips';
  /** Follow-up chips include the permission mode. New task leaves it stored. */
  showPermission?: boolean;
}) {
  const { configuredAgents } = useConfiguredAgents();
  const { data: cache } = useQuery({
    queryKey: ['agent-models'],
    queryFn: () => agentModelsApi.get(),
    staleTime: 60_000,
  });

  const models = cache?.agents[selection.executor]?.models ?? [];
  const modelError = cache?.agents[selection.executor]?.error;
  const ready = cache?.ready ?? false;
  const selectedModel = models.find((model) => model.id === selection.model);

  const chooseAgent = (executor: BaseCodingAgent) => {
    const nextModels = cache?.agents[executor]?.models ?? [];
    onChange({
      executor,
      model: adjustModel(selection.model, nextModels),
      permission: adjustPermission(executor, selection.permission),
    });
  };

  const agentMenu = agentFixed ? (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-xs text-foreground">
      <AgentIcon agent={selection.executor} className="h-3.5 w-3.5" />
      <span className="truncate">{agentLabel(selection.executor)}</span>
    </span>
  ) : (
    <AgentMenu
      agents={configuredAgents}
      executor={selection.executor}
      disabled={disabled}
      chip={variant === 'chips'}
      onChange={chooseAgent}
    />
  );
  const modelMenu = (
    <ModelMenu
      models={models}
      ready={ready}
      error={modelError}
      selectedId={selection.model}
      selectedLabel={
        selection.model
          ? (selectedModel?.label ?? selection.model)
          : models.length > 0 || ready
            ? 'Default'
            : '…'
      }
      disabled={disabled}
      chip={variant === 'chips'}
      onChange={(model) => onChange({ ...selection, model })}
    />
  );

  if (variant === 'chips') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {showPermission && (
          <PermissionMenu
            agent={selection.executor}
            permission={selection.permission}
            disabled={disabled}
            chip
            onChange={(permission) => onChange({ ...selection, permission })}
          />
        )}
        {agentMenu}
        {modelMenu}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <PermissionMenu
        agent={selection.executor}
        permission={selection.permission}
        disabled={disabled}
        onChange={(permission) => onChange({ ...selection, permission })}
      />
      <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
        {agentFixed ? (
          <span className="truncate text-foreground/80">
            {agentLabel(selection.executor)}
          </span>
        ) : (
          agentMenu
        )}
        {modelMenu}
      </div>
    </div>
  );
}

function permissionIcon(permission: PermissionLevel): LucideIcon {
  switch (permission) {
    case PermissionLevel.PLAN:
      return ListTodo;
    case PermissionLevel.ACCEPT_EDITS:
      return FilePen;
    case PermissionLevel.BYPASS:
      return ShieldOff;
    case PermissionLevel.AUTO:
    case PermissionLevel.MANUAL:
      return Shield;
  }
}

function PermissionMenu({
  agent,
  permission,
  disabled,
  chip = false,
  onChange,
}: {
  agent: BaseCodingAgent;
  permission: PermissionLevel;
  disabled: boolean;
  chip?: boolean;
  onChange: (permission: PermissionLevel) => void;
}) {
  const modes = supportedPermissions(agent);
  const Icon = permissionIcon(permission);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label="Permission"
          className={
            chip
              ? chipTriggerClass
              : 'h-8 shrink-0 px-2 text-sm font-normal text-foreground/80'
          }
        >
          {chip && <Icon className="text-muted-foreground" />}
          {permissionLabel(permission)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        {modes.map((mode) => (
          <DropdownMenuItem key={mode} onClick={() => onChange(mode)}>
            <span className="min-w-0 flex-1">
              <span className="block">
                {permissionLabel(mode)}
                {mode === PermissionLevel.AUTO && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Recommended
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {permissionHint(mode)}
              </span>
            </span>
            {mode === permission && <Check className="ml-2 h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AgentMenu({
  agents,
  executor,
  disabled,
  chip = false,
  onChange,
}: {
  agents: BaseCodingAgent[];
  executor: BaseCodingAgent;
  disabled: boolean;
  chip?: boolean;
  onChange: (executor: BaseCodingAgent) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label="Agent"
          className={
            chip
              ? `max-w-[12rem] ${chipTriggerClass}`
              : 'h-8 max-w-[10rem] px-2 text-sm font-normal text-foreground/80'
          }
        >
          {chip && <AgentIcon agent={executor} className="h-3.5 w-3.5" />}
          <span className="truncate">{agentLabel(executor)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        {agents.map((agent) => (
          <DropdownMenuItem key={agent} onClick={() => onChange(agent)}>
            <span className="min-w-0 flex-1 truncate">{agentLabel(agent)}</span>
            {agent === executor && <Check className="ml-2 h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelMenu({
  models,
  ready,
  error,
  selectedId,
  selectedLabel,
  disabled,
  chip = false,
  onChange,
}: {
  models: ListedModel[];
  ready: boolean;
  error?: string | null;
  selectedId: string | null;
  selectedLabel: string;
  disabled: boolean;
  chip?: boolean;
  onChange: (model: string | null) => void;
}) {
  const featured = models.filter((model) => model.featured);
  const rest = models.filter((model) => !model.featured);
  const shown = featured.length > 0 ? featured : models;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label="Model"
          className={
            chip
              ? `max-w-[12rem] ${chipTriggerClass}`
              : 'h-8 max-w-[12rem] px-2 text-sm font-normal text-foreground/80'
          }
        >
          {chip && <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="truncate">{selectedLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        {!ready && (
          <DropdownMenuItem disabled>Loading models…</DropdownMenuItem>
        )}
        {ready && error && (
          <DropdownMenuItem disabled>Couldn’t load models</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onChange(null)}>
          <span className="min-w-0 flex-1">Default</span>
          {selectedId == null && <Check className="ml-2 h-3.5 w-3.5" />}
        </DropdownMenuItem>
        {shown.map((model) => (
          <ModelItem
            key={model.id}
            model={model}
            selected={model.id === selectedId}
            onChange={onChange}
          />
        ))}
        {hasMoreModels(models) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>More models</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {rest.map((model) => (
                  <ModelItem
                    key={model.id}
                    model={model}
                    selected={model.id === selectedId}
                    onChange={onChange}
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelItem({
  model,
  selected,
  onChange,
}: {
  model: ListedModel;
  selected: boolean;
  onChange: (model: string) => void;
}) {
  return (
    <DropdownMenuItem onClick={() => onChange(model.id)}>
      <span className="min-w-0 flex-1 truncate">{model.label}</span>
      {selected && <Check className="ml-2 h-3.5 w-3.5" />}
    </DropdownMenuItem>
  );
}
