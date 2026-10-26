import { describe, expect, it } from 'vitest';
import { BaseCodingAgent, PermissionLevel } from 'shared/types';
import {
  adjustModel,
  adjustPermission,
  hasMoreModels,
  supportedPermissions,
} from './agentRun';

describe('agent run selection', () => {
  it('drops a permission the new agent does not offer and selects Manual', () => {
    expect(adjustPermission(BaseCodingAgent.GEMINI, PermissionLevel.PLAN)).toBe(
      PermissionLevel.MANUAL
    );
    expect(supportedPermissions(BaseCodingAgent.CURSOR_AGENT)).not.toContain(
      PermissionLevel.AUTO
    );
  });

  it('keeps a model that is in the new list and drops one that is not', () => {
    const models = [
      { id: 'composer-2.5', label: 'Composer 2.5', featured: true },
    ];
    expect(adjustModel('composer-2.5', models)).toBe('composer-2.5');
    expect(adjustModel('claude-opus-5-5', models)).toBeNull();
    expect(adjustModel(null, models)).toBeNull();
  });

  it('shows More models only when the list is split', () => {
    expect(
      hasMoreModels([
        { id: 'a', label: 'A', featured: true },
        { id: 'b', label: 'B', featured: false },
      ])
    ).toBe(true);
    expect(
      hasMoreModels([
        { id: 'a', label: 'A', featured: true },
        { id: 'b', label: 'B', featured: true },
      ])
    ).toBe(false);
  });
});
