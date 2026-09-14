//! Linear GraphQL client — personal API key auth against `https://api.linear.app/graphql`.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;
use ts_rs::TS;

const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";
const DEFAULT_PAGE_SIZE: u32 = 25;
const MAX_PAGE_SIZE: u32 = 50;

/// Shared issue fields for list + search queries.
const ISSUE_NODE_FIELDS: &str = r#"
  id
  identifier
  title
  description
  url
  priority
  estimate
  dueDate
  createdAt
  updatedAt
  state { name type color }
  team { name }
  assignee { name }
  project { name }
  cycle { name }
  labels { nodes { name } }
  comments(first: 50) {
    nodes {
      id
      body
      createdAt
      user { name }
    }
  }
"#;

#[derive(Debug, Error)]
pub enum LinearError {
    #[error("Linear request failed: {0}")]
    Transport(String),
    #[error("Linear rejected the API key")]
    Unauthorized,
    #[error("Linear error: {0}")]
    Api(String),
    #[error("Unexpected Linear response: {0}")]
    Unexpected(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearComment {
    pub id: String,
    pub body: String,
    pub author: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub status_type: Option<String>,
    pub status_color: Option<String>,
    pub team: String,
    pub assignee: Option<String>,
    pub labels: Vec<String>,
    pub priority: String,
    pub project: Option<String>,
    pub cycle: Option<String>,
    pub estimate: Option<f64>,
    pub due_date: Option<String>,
    pub url: String,
    pub created_at: String,
    pub updated_at: String,
    pub comments: Vec<LinearComment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearViewer {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearPageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearIssuesResponse {
    pub viewer: LinearViewer,
    pub issues: Vec<LinearIssue>,
    pub page_info: LinearPageInfo,
    /// Total matching issues for the current filter (from Linear `totalCount`).
    pub total_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearIdName {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearWorkflowState {
    pub id: String,
    pub name: String,
    /// Linear workflow type: triage | backlog | unstarted | started | completed | canceled
    pub type_name: String,
    pub color: String,
    pub team_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LinearMetaResponse {
    pub viewer: LinearViewer,
    pub teams: Vec<LinearIdName>,
    pub users: Vec<LinearIdName>,
    pub states: Vec<LinearWorkflowState>,
}

/// Query params for listing issues. `assignee` defaults to `"me"` when omitted by the route.
#[derive(Debug, Clone, Default)]
pub struct LinearIssueQuery {
    pub status: Option<String>,
    pub assignee: Option<String>,
    pub team: Option<String>,
    /// Free-text search (Linear `searchIssues` when non-empty).
    pub q: Option<String>,
    pub after: Option<String>,
    pub first: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct GraphQlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphQlError>>,
}

#[derive(Debug, Deserialize)]
struct GraphQlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct ViewerOnlyData {
    viewer: ViewerNode,
}

#[derive(Debug, Deserialize)]
struct IssuesData {
    viewer: ViewerNode,
    issues: IssueConnection,
}

#[derive(Debug, Deserialize)]
struct SearchIssuesData {
    viewer: ViewerNode,
    #[serde(rename = "searchIssues")]
    search_issues: SearchIssuesConnection,
}

#[derive(Debug, Deserialize)]
struct SearchIssuesConnection {
    nodes: Vec<IssueNode>,
    #[serde(rename = "pageInfo")]
    page_info: PageInfoNode,
    /// Linear types this as Float.
    #[serde(rename = "totalCount", default)]
    total_count: f64,
}

#[derive(Debug, Deserialize)]
struct IssueCountData {
    issues: IssueIdConnection,
}

#[derive(Debug, Deserialize)]
struct MetaData {
    viewer: ViewerNode,
    teams: Option<IdNameConnection>,
    users: Option<IdNameConnection>,
    #[serde(rename = "workflowStates")]
    workflow_states: Option<WorkflowStateConnection>,
}

#[derive(Debug, Deserialize)]
struct ViewerNode {
    id: String,
    name: String,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IssueConnection {
    nodes: Vec<IssueNode>,
    #[serde(rename = "pageInfo")]
    page_info: PageInfoNode,
}

#[derive(Debug, Deserialize)]
struct IssueIdConnection {
    nodes: Vec<IdOnlyNode>,
    #[serde(rename = "pageInfo")]
    page_info: PageInfoNode,
}

#[derive(Debug, Deserialize)]
struct PageInfoNode {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IssueNode {
    id: String,
    identifier: String,
    title: String,
    description: Option<String>,
    url: String,
    priority: Option<i32>,
    estimate: Option<f64>,
    #[serde(rename = "dueDate")]
    due_date: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    state: Option<StateNode>,
    team: Option<NamedNode>,
    assignee: Option<NamedNode>,
    project: Option<NamedNode>,
    cycle: Option<NamedNode>,
    labels: Option<LabelConnection>,
    comments: Option<CommentConnection>,
}

#[derive(Debug, Deserialize)]
struct StateNode {
    name: Option<String>,
    #[serde(rename = "type")]
    type_: Option<String>,
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NamedNode {
    /// Linear sometimes returns `{ "name": null }` (e.g. cycles without a name).
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LabelConnection {
    nodes: Vec<NamedNode>,
}

#[derive(Debug, Deserialize)]
struct CommentConnection {
    nodes: Vec<CommentNode>,
}

#[derive(Debug, Deserialize)]
struct CommentNode {
    id: String,
    body: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    user: Option<NamedNode>,
}

#[derive(Debug, Deserialize)]
struct IdNameConnection {
    nodes: Vec<IdNameNode>,
}

#[derive(Debug, Deserialize)]
struct IdNameNode {
    id: String,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WorkflowStateConnection {
    nodes: Vec<WorkflowStateNode>,
}

#[derive(Debug, Deserialize)]
struct WorkflowStateNode {
    id: String,
    name: Option<String>,
    #[serde(rename = "type")]
    type_: Option<String>,
    color: Option<String>,
    team: Option<IdOnlyNode>,
}

#[derive(Debug, Deserialize)]
struct IdOnlyNode {
    id: String,
}

pub struct LinearClient {
    http: Client,
    api_key: String,
}

impl LinearClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            http: Client::new(),
            api_key: api_key.into(),
        }
    }

    /// Validate the key by fetching the current viewer.
    pub async fn validate(&self) -> Result<LinearViewer, LinearError> {
        let data: ViewerOnlyData = self
            .graphql(
                r#"
                query {
                  viewer {
                    id
                    name
                    email
                  }
                }
                "#,
                json!({}),
            )
            .await?;

        Ok(LinearViewer {
            id: data.viewer.id,
            name: data.viewer.name,
            email: data.viewer.email,
        })
    }

    /// Paginated issues with remote filters. Uses Linear `searchIssues` when `q` is set.
    pub async fn list_issues(
        &self,
        query: LinearIssueQuery,
    ) -> Result<LinearIssuesResponse, LinearError> {
        let viewer = self.validate().await?;
        let first = query.first.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE);
        let filter = build_issue_filter(&query, &viewer.id);
        let term = query
            .q
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);

        if let Some(term) = term {
            return self
                .search_issues_page(term, first, query.after, filter)
                .await;
        }

        self.list_issues_page(first, query.after, filter).await
    }

    async fn list_issues_page(
        &self,
        first: u32,
        after: Option<String>,
        filter: Value,
    ) -> Result<LinearIssuesResponse, LinearError> {
        let data: IssuesData = self
            .graphql(
                &format!(
                    r#"
                query ListIssues($first: Int!, $after: String, $filter: IssueFilter) {{
                  viewer {{
                    id
                    name
                    email
                  }}
                  issues(
                    first: $first
                    after: $after
                    orderBy: updatedAt
                    filter: $filter
                  ) {{
                    pageInfo {{
                      hasNextPage
                      endCursor
                    }}
                    nodes {{
                      {ISSUE_NODE_FIELDS}
                    }}
                  }}
                }}
                "#
                ),
                json!({
                    "first": first,
                    "after": after,
                    "filter": filter,
                }),
            )
            .await?;

        let viewer = LinearViewer {
            id: data.viewer.id,
            name: data.viewer.name,
            email: data.viewer.email,
        };

        let issues: Vec<LinearIssue> = data.issues.nodes.into_iter().map(map_issue).collect();
        let page_info = LinearPageInfo {
            has_next_page: data.issues.page_info.has_next_page,
            end_cursor: data.issues.page_info.end_cursor,
        };

        // Linear IssueConnection has no totalCount — finish counting with id-only pages
        // on the first request only (later pages reuse pages[0].total_count on the client).
        let total_count = if after.is_none() {
            if !page_info.has_next_page {
                issues.len() as u32
            } else {
                let rest = self
                    .count_matching_issues_after(&filter, page_info.end_cursor.clone())
                    .await?;
                issues.len() as u32 + rest
            }
        } else {
            0
        };

        Ok(LinearIssuesResponse {
            viewer,
            issues,
            page_info,
            total_count,
        })
    }

    async fn search_issues_page(
        &self,
        term: String,
        first: u32,
        after: Option<String>,
        filter: Value,
    ) -> Result<LinearIssuesResponse, LinearError> {
        let data: SearchIssuesData = self
            .graphql(
                &format!(
                    r#"
                query SearchIssues(
                  $term: String!
                  $first: Int!
                  $after: String
                  $filter: IssueFilter
                ) {{
                  viewer {{
                    id
                    name
                    email
                  }}
                  searchIssues(
                    term: $term
                    first: $first
                    after: $after
                    filter: $filter
                  ) {{
                    totalCount
                    pageInfo {{
                      hasNextPage
                      endCursor
                    }}
                    nodes {{
                      {ISSUE_NODE_FIELDS}
                    }}
                  }}
                }}
                "#
                ),
                json!({
                    "term": term,
                    "first": first,
                    "after": after,
                    "filter": filter,
                }),
            )
            .await?;

        let viewer = LinearViewer {
            id: data.viewer.id,
            name: data.viewer.name,
            email: data.viewer.email,
        };

        let issues: Vec<LinearIssue> = data
            .search_issues
            .nodes
            .into_iter()
            .map(map_issue)
            .collect();
        let page_info = LinearPageInfo {
            has_next_page: data.search_issues.page_info.has_next_page,
            end_cursor: data.search_issues.page_info.end_cursor,
        };
        let total_count = if after.is_none() {
            data.search_issues.total_count.max(0.0) as u32
        } else {
            0
        };

        Ok(LinearIssuesResponse {
            viewer,
            issues,
            page_info,
            total_count,
        })
    }

    /// Count remaining issues after `after` by paging ids only (max 250/page).
    async fn count_matching_issues_after(
        &self,
        filter: &Value,
        mut after: Option<String>,
    ) -> Result<u32, LinearError> {
        const PAGE: u32 = 250;
        let mut total: u32 = 0;

        while after.is_some() {
            let data: IssueCountData = self
                .graphql(
                    r#"
                    query CountIssues($first: Int!, $after: String, $filter: IssueFilter) {
                      issues(
                        first: $first
                        after: $after
                        orderBy: updatedAt
                        filter: $filter
                      ) {
                        nodes { id }
                        pageInfo {
                          hasNextPage
                          endCursor
                        }
                      }
                    }
                    "#,
                    json!({
                        "first": PAGE,
                        "after": after,
                        "filter": filter,
                    }),
                )
                .await?;

            total += data.issues.nodes.len() as u32;
            if !data.issues.page_info.has_next_page || total >= 50_000 {
                break;
            }
            after = data.issues.page_info.end_cursor;
        }

        Ok(total)
    }

    /// Teams, users, and workflow states for filter menus / status badges.
    pub async fn meta(&self) -> Result<LinearMetaResponse, LinearError> {
        let data: MetaData = self
            .graphql(
                r#"
                query LinearMeta {
                  viewer {
                    id
                    name
                    email
                  }
                  teams(first: 50) {
                    nodes { id name }
                  }
                  users(first: 100, filter: { active: { eq: true } }) {
                    nodes { id name }
                  }
                  workflowStates(first: 250) {
                    nodes {
                      id
                      name
                      type
                      color
                      team { id }
                    }
                  }
                }
                "#,
                json!({}),
            )
            .await?;

        let viewer = LinearViewer {
            id: data.viewer.id,
            name: data.viewer.name,
            email: data.viewer.email,
        };

        let teams = data
            .teams
            .map(|c| {
                c.nodes
                    .into_iter()
                    .filter_map(|n| {
                        let name = n.name?.trim().to_string();
                        (!name.is_empty()).then(|| LinearIdName { id: n.id, name })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let users = data
            .users
            .map(|c| {
                c.nodes
                    .into_iter()
                    .filter_map(|n| {
                        let name = n.name?.trim().to_string();
                        (!name.is_empty()).then(|| LinearIdName { id: n.id, name })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let states = data
            .workflow_states
            .map(|c| {
                c.nodes
                    .into_iter()
                    .filter_map(|n| {
                        let name = n.name?.trim().to_string();
                        if name.is_empty() {
                            return None;
                        }
                        Some(LinearWorkflowState {
                            id: n.id,
                            name,
                            type_name: n.type_.unwrap_or_else(|| "unstarted".into()),
                            color: n.color.unwrap_or_else(|| "#95a2b3".into()),
                            team_id: n.team.map(|t| t.id),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(LinearMetaResponse {
            viewer,
            teams,
            users,
            states,
        })
    }

    async fn graphql<T: for<'de> Deserialize<'de>>(
        &self,
        query: &str,
        variables: Value,
    ) -> Result<T, LinearError> {
        let response = self
            .http
            .post(LINEAR_GRAPHQL_URL)
            .header("Authorization", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&json!({ "query": query, "variables": variables }))
            .send()
            .await
            .map_err(|e| LinearError::Transport(e.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| LinearError::Transport(e.to_string()))?;

        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err(LinearError::Unauthorized);
        }
        if !status.is_success() {
            return Err(LinearError::Api(format!("HTTP {status}: {body}")));
        }

        let parsed: GraphQlResponse<T> = serde_json::from_str(&body)
            .map_err(|e| LinearError::Unexpected(format!("{e}; body={body}")))?;

        if let Some(errors) = parsed.errors
            && !errors.is_empty()
        {
            let message = errors
                .iter()
                .map(|e| e.message.as_str())
                .collect::<Vec<_>>()
                .join("; ");
            if message.to_lowercase().contains("auth")
                || message.to_lowercase().contains("unauthorized")
            {
                return Err(LinearError::Unauthorized);
            }
            return Err(LinearError::Api(message));
        }

        parsed
            .data
            .ok_or_else(|| LinearError::Unexpected("missing data".into()))
    }
}

/// Build Linear `IssueFilter` JSON. When `status` is set, filter by workflow state
/// **name** (shared across teams) and do not exclude completed/canceled types.
/// Assignee defaults to the viewer when `query.assignee` is `None` or `"me"`.
pub fn build_issue_filter(query: &LinearIssueQuery, viewer_id: &str) -> Value {
    let mut filter = serde_json::Map::new();

    if let Some(status_name) = query
        .status
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "all")
    {
        // Name — not id — so one "Triage" filter matches every team's Triage state.
        filter.insert("state".into(), json!({ "name": { "eq": status_name } }));
    } else {
        filter.insert(
            "state".into(),
            json!({ "type": { "nin": ["completed", "canceled"] } }),
        );
    }

    let assignee = query.assignee.as_deref().unwrap_or("me");
    match assignee {
        "all" => {}
        "unassigned" => {
            filter.insert("assignee".into(), json!({ "null": true }));
        }
        "me" => {
            filter.insert("assignee".into(), json!({ "id": { "eq": viewer_id } }));
        }
        id => {
            filter.insert("assignee".into(), json!({ "id": { "eq": id } }));
        }
    }

    if let Some(team_id) = query
        .team
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "all")
    {
        filter.insert("team".into(), json!({ "id": { "eq": team_id } }));
    }

    Value::Object(filter)
}

fn map_issue(node: IssueNode) -> LinearIssue {
    let (status, status_type, status_color) = match node.state {
        Some(state) => (
            state
                .name
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Unknown".into()),
            state
                .type_
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            state
                .color
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        ),
        None => ("Unknown".into(), None, None),
    };

    LinearIssue {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        description: node.description.unwrap_or_default(),
        status,
        status_type,
        status_color,
        team: named_required(node.team, "Unknown"),
        assignee: named_optional(node.assignee),
        labels: node
            .labels
            .map(|l| {
                l.nodes
                    .into_iter()
                    .filter_map(|n| n.name.filter(|s| !s.is_empty()))
                    .collect()
            })
            .unwrap_or_default(),
        priority: map_priority(node.priority),
        project: named_optional(node.project),
        cycle: named_optional(node.cycle),
        estimate: node.estimate,
        due_date: node.due_date,
        url: node.url,
        created_at: node.created_at,
        updated_at: node.updated_at,
        comments: node
            .comments
            .map(|c| {
                c.nodes
                    .into_iter()
                    .map(|comment| LinearComment {
                        id: comment.id,
                        body: comment.body,
                        author: named_optional(comment.user),
                        created_at: comment.created_at,
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn named_optional(node: Option<NamedNode>) -> Option<String> {
    node.and_then(|n| n.name)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn named_required(node: Option<NamedNode>, fallback: &str) -> String {
    named_optional(node).unwrap_or_else(|| fallback.to_string())
}

fn map_priority(priority: Option<i32>) -> String {
    match priority.unwrap_or(0) {
        1 => "Urgent".into(),
        2 => "High".into(),
        3 => "Medium".into(),
        4 => "Low".into(),
        _ => "No priority".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        NamedNode, build_issue_filter, map_priority, named_optional, LinearIssueQuery,
    };
    use serde_json::json;

    #[test]
    fn priority_labels_match_linear() {
        assert_eq!(map_priority(Some(1)), "Urgent");
        assert_eq!(map_priority(Some(0)), "No priority");
        assert_eq!(map_priority(None), "No priority");
    }

    #[test]
    fn cycle_with_null_name_becomes_none() {
        assert_eq!(named_optional(Some(NamedNode { name: None })), None);
        assert_eq!(
            named_optional(Some(NamedNode {
                name: Some("Cycle 12".into())
            })),
            Some("Cycle 12".into())
        );
    }

    #[test]
    fn default_filter_excludes_completed_and_assigns_viewer() {
        let filter = build_issue_filter(&LinearIssueQuery::default(), "viewer-1");
        assert_eq!(
            filter,
            json!({
                "state": { "type": { "nin": ["completed", "canceled"] } },
                "assignee": { "id": { "eq": "viewer-1" } }
            })
        );
    }

    #[test]
    fn status_filter_skips_type_exclusion() {
        let filter = build_issue_filter(
            &LinearIssueQuery {
                status: Some("Done".into()),
                assignee: Some("all".into()),
                ..Default::default()
            },
            "viewer-1",
        );
        assert_eq!(
            filter,
            json!({
                "state": { "name": { "eq": "Done" } }
            })
        );
    }

    #[test]
    fn unassigned_and_team_filters() {
        let filter = build_issue_filter(
            &LinearIssueQuery {
                assignee: Some("unassigned".into()),
                team: Some("team-9".into()),
                ..Default::default()
            },
            "viewer-1",
        );
        assert_eq!(
            filter,
            json!({
                "state": { "type": { "nin": ["completed", "canceled"] } },
                "assignee": { "null": true },
                "team": { "id": { "eq": "team-9" } }
            })
        );
    }

    #[test]
    fn specific_assignee_id() {
        let filter = build_issue_filter(
            &LinearIssueQuery {
                assignee: Some("user-42".into()),
                ..Default::default()
            },
            "viewer-1",
        );
        assert_eq!(
            filter["assignee"],
            json!({ "id": { "eq": "user-42" } })
        );
    }
}
