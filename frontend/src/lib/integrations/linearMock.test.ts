import { describe, expect, it } from 'vitest';
import {
  assignedLinearIssues,
  findLinearIssue,
  issueToTaskDraft,
} from './linearMock';

describe('assignedLinearIssues', () => {
  it('returns tickets assigned to the current user', () => {
    const issues = assignedLinearIssues();
    expect(issues.map((issue) => issue.identifier)).toEqual([
      'ENG-214',
      'ENG-198',
      'ENG-176',
    ]);
  });
});

describe('findLinearIssue', () => {
  it('finds a ticket by id', () => {
    const issue = findLinearIssue('eng-214');
    expect(issue?.title).toBe('Fix login redirect after SSO');
  });

  it('returns undefined for an unknown ticket', () => {
    expect(findLinearIssue('missing')).toBeUndefined();
  });
});

describe('issueToTaskDraft', () => {
  it('builds a task title, description, and Linear source from the ticket', () => {
    const issue = findLinearIssue('eng-214');
    expect(issue).toBeDefined();
    const draft = issueToTaskDraft(issue!);
    expect(draft.title).toBe('ENG-214 Fix login redirect after SSO');
    expect(draft.description).toContain('return URL');
    expect(draft.description).toContain('Linear: ENG-214');
    expect(draft.description).toContain(issue!.url);
    expect(draft.source).toEqual({
      provider: 'linear',
      id: issue!.id,
      identifier: 'ENG-214',
      url: issue!.url,
    });
  });
});
