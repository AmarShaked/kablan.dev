import {
  BaseCodingAgent,
  PermissionLevel,
  type AgentRunSelection,
  type ExecutorProfileId,
  type ListedModel,
} from 'shared/types';

const MANUAL_AND_BYPASS = [PermissionLevel.MANUAL, PermissionLevel.BYPASS];

export function supportedPermissions(
  agent: BaseCodingAgent
): PermissionLevel[] {
  switch (agent) {
    case BaseCodingAgent.CLAUDE_CODE:
      return [
        PermissionLevel.AUTO,
        PermissionLevel.MANUAL,
        PermissionLevel.ACCEPT_EDITS,
        PermissionLevel.PLAN,
        PermissionLevel.BYPASS,
      ];
    case BaseCodingAgent.OPENCODE:
      return [
        PermissionLevel.MANUAL,
        PermissionLevel.PLAN,
        PermissionLevel.BYPASS,
      ];
    case BaseCodingAgent.DROID:
      return [
        PermissionLevel.AUTO,
        PermissionLevel.MANUAL,
        PermissionLevel.ACCEPT_EDITS,
        PermissionLevel.BYPASS,
      ];
    default:
      return MANUAL_AND_BYPASS;
  }
}

export function adjustPermission(
  agent: BaseCodingAgent,
  current: PermissionLevel
): PermissionLevel {
  return supportedPermissions(agent).includes(current)
    ? current
    : PermissionLevel.MANUAL;
}

export function adjustModel(
  current: string | null,
  models: ListedModel[]
): string | null {
  if (!current) return null;
  return models.some((model) => model.id === current) ? current : null;
}

export function hasMoreModels(models: ListedModel[]): boolean {
  return (
    models.some((model) => model.featured) &&
    models.some((model) => !model.featured)
  );
}

export function firstRunSelection(): AgentRunSelection {
  return {
    executor: BaseCodingAgent.CLAUDE_CODE,
    model: null,
    permission: PermissionLevel.BYPASS,
  };
}

export function profileToSelection(
  profile: ExecutorProfileId | null | undefined
): AgentRunSelection {
  if (!profile) return firstRunSelection();
  const permission =
    profile.variant === 'PLAN'
      ? PermissionLevel.PLAN
      : profile.variant === 'APPROVALS'
        ? PermissionLevel.MANUAL
        : PermissionLevel.BYPASS;
  return {
    executor: profile.executor,
    model: null,
    permission,
  };
}

export function permissionLabel(permission: PermissionLevel): string {
  switch (permission) {
    case PermissionLevel.AUTO:
      return 'Auto';
    case PermissionLevel.MANUAL:
      return 'Manual';
    case PermissionLevel.ACCEPT_EDITS:
      return 'Accept edits';
    case PermissionLevel.PLAN:
      return 'Plan';
    case PermissionLevel.BYPASS:
      return 'Bypass permissions';
  }
}

export function permissionHint(permission: PermissionLevel): string {
  switch (permission) {
    case PermissionLevel.AUTO:
      return 'Handles permission decisions';
    case PermissionLevel.MANUAL:
      return 'Always ask before making changes';
    case PermissionLevel.ACCEPT_EDITS:
      return 'Automatically accept all file edits';
    case PermissionLevel.PLAN:
      return 'Create a plan before making changes';
    case PermissionLevel.BYPASS:
      return 'Accepts all permissions';
  }
}
