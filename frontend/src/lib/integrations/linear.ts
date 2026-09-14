import type {
  LinearComment as ApiLinearComment,
  LinearIssue as ApiLinearIssue,
} from 'shared/types';

export type LinearPriority =
  | 'Urgent'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'No priority';

export type LinearStatusType =
  | 'triage'
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'canceled';

export type IntegrationComment = {
  id: string;
  body: string;
  author: string | null;
  createdAt: string;
};

export type IntegrationIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  status: string;
  statusType: LinearStatusType | null;
  statusColor: string | null;
  team: string;
  /** Display name, or null when nobody is assigned. */
  assignee: string | null;
  labels: string[];
  priority: LinearPriority;
  project: string | null;
  cycle: string | null;
  estimate: number | null;
  dueDate: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  comments: IntegrationComment[];
};

export type TaskSourceDraft = {
  provider: string;
  id: string;
  identifier: string;
  url: string;
};

export type TaskFromIssueDraft = {
  title: string;
  description: string;
  source: TaskSourceDraft;
};

export function issueToTaskDraft(issue: IntegrationIssue): TaskFromIssueDraft {
  return {
    title: `${issue.identifier} ${issue.title}`,
    description: `${issue.description}\n\nLinear: ${issue.identifier}\n${issue.url}`,
    source: {
      provider: 'linear',
      id: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    },
  };
}

function mapStatusType(value: string | null | undefined): LinearStatusType | null {
  switch (value) {
    case 'triage':
    case 'backlog':
    case 'unstarted':
    case 'started':
    case 'completed':
    case 'canceled':
      return value;
    default:
      return null;
  }
}

function mapApiComment(comment: ApiLinearComment): IntegrationComment {
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author,
    createdAt: comment.created_at,
  };
}

export function mapApiLinearIssue(issue: ApiLinearIssue): IntegrationIssue {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    statusType: mapStatusType(issue.status_type),
    statusColor: issue.status_color,
    team: issue.team,
    assignee: issue.assignee,
    labels: issue.labels,
    priority: (issue.priority as LinearPriority) || 'No priority',
    project: issue.project,
    cycle: issue.cycle,
    estimate: issue.estimate,
    dueDate: issue.due_date,
    url: issue.url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    comments: (issue.comments ?? [])
      .map(mapApiComment)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function getNextLinearPageParam(page: {
  page_info: { has_next_page: boolean; end_cursor: string | null };
}): string | undefined {
  if (!page.page_info.has_next_page || !page.page_info.end_cursor) {
    return undefined;
  }
  return page.page_info.end_cursor;
}
