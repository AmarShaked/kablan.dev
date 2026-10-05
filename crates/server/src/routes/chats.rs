//! Chat agent turns: reply in PocketBase threads and create/start Kablan tasks.

use std::{path::PathBuf, process::Stdio, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::post,
};
use db::models::{
    image::TaskImage,
    project::Project,
    project_repo::ProjectRepo,
    repo::RepoError,
    task::{CreateTask, Task, TaskWithAttemptStatus},
    workspace::{CreateWorkspace, Workspace},
    workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
};
use deployment::Deployment;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize};
use services::services::{container::ContainerService, events::task_patch};
use sqlx::Error as SqlxError;
use tokio::process::Command;
use utils::{response::ApiResponse, shell::resolve_executable_path};
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    pocketbase::PocketBaseClient,
    routes::task_attempts::WorkspaceRepoInput,
};

#[derive(Debug, Deserialize)]
pub struct AgentTurnRequest {
    pub message_id: String,
    /// BaseCodingAgent string, e.g. `CLAUDE_CODE`.
    pub agent: String,
    pub project_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct AgentTurnResponse {
    pub accepted: bool,
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let _ = deployment;
    Router::new().route("/chats/{chat_id}/agent-turn", post(agent_turn))
}

pub async fn agent_turn(
    State(deployment): State<DeploymentImpl>,
    Path(chat_id): Path<String>,
    Json(payload): Json<AgentTurnRequest>,
) -> Result<ResponseJson<ApiResponse<AgentTurnResponse>>, ApiError> {
    let agent = BaseCodingAgent::from_str_loose(&payload.agent).map_err(|e| {
        ApiError::BadRequest(format!("Unknown agent '{}': {e}", payload.agent))
    })?;

    let pb = PocketBaseClient::from_env().await.map_err(|e| {
        ApiError::BadRequest(format!("PocketBase service auth failed: {e}"))
    })?;

    let trigger = pb
        .get_message(&payload.message_id)
        .await
        .map_err(|e| ApiError::BadRequest(format!("Message not found: {e}")))?;
    if trigger.chat != chat_id {
        return Err(ApiError::BadRequest(
            "message_id does not belong to this chat".to_string(),
        ));
    }

    let history = pb
        .list_messages(&chat_id, 40)
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to load chat history: {e}")))?;

    let preferred_project = payload.project_id;
    tokio::spawn(async move {
        if let Err(err) = run_agent_turn(
            deployment,
            pb,
            chat_id,
            agent,
            trigger.body,
            history,
            preferred_project,
        )
        .await
        {
            tracing::error!("Chat agent turn failed: {err:#}");
        }
    });

    Ok(ResponseJson(ApiResponse::success(AgentTurnResponse {
        accepted: true,
    })))
}

trait BaseCodingAgentParse {
    fn from_str_loose(s: &str) -> Result<BaseCodingAgent, String>;
}

impl BaseCodingAgentParse for BaseCodingAgent {
    fn from_str_loose(s: &str) -> Result<BaseCodingAgent, String> {
        use std::str::FromStr;
        let normalized = s
            .trim()
            .replace('-', "_")
            .replace(' ', "_")
            .to_ascii_uppercase();
        let aliases = match normalized.as_str() {
            "CLAUDE" | "CLAUDECODE" => "CLAUDE_CODE",
            "CURSOR" | "CURSORAGENT" => "CURSOR_AGENT",
            "QWEN" | "QWENCODE" => "QWEN_CODE",
            other => other,
        };
        BaseCodingAgent::from_str(aliases).map_err(|e| e.to_string())
    }
}

async fn run_agent_turn(
    deployment: DeploymentImpl,
    pb: PocketBaseClient,
    chat_id: String,
    agent: BaseCodingAgent,
    user_message: String,
    history: Vec<crate::pocketbase::PbMessage>,
    preferred_project: Option<Uuid>,
) -> anyhow::Result<()> {
    let agent_name = agent.to_string();
    let status = pb
        .create_agent_message(
            &chat_id,
            &agent_name,
            "Working on it…",
            None,
            None,
        )
        .await?;
    let status_id = status.id;

    let mut tool_notes: Vec<String> = Vec::new();
    if let Some(pid) = preferred_project {
        tool_notes.push(format!("Preferred project_id from client: {pid}"));
    }

    // Up to a few tool rounds: ask the CLI (or fall back) then execute tools.
    for round in 0..5 {
        let decision = decide_next_action(&agent, &user_message, &history, &tool_notes, round).await;

        match decision {
            AgentDecision::Reply(text) => {
                let _ = pb
                    .update_agent_message(&status_id, &text, None, None)
                    .await;
                return Ok(());
            }
            AgentDecision::ListProjects => {
                let projects = Project::find_all(&deployment.db().pool).await?;
                if projects.is_empty() {
                    tool_notes.push("list_projects => (none)".into());
                    let _ = pb
                        .update_agent_message(
                            &status_id,
                            "You have no projects yet. Create one in Kablan, then ask me again.",
                            None,
                            None,
                        )
                        .await;
                    return Ok(());
                }
                let summary = projects
                    .iter()
                    .map(|p| format!("- {} (`{}`)", p.name, p.id))
                    .collect::<Vec<_>>()
                    .join("\n");
                tool_notes.push(format!("list_projects =>\n{summary}"));
                // Prefer resolving a project and finishing in this turn; otherwise replace
                // the waiting bubble with the project list.
                if let Some(project_id) =
                    resolve_project_id(&deployment, preferred_project, &user_message, &projects)
                        .await
                {
                    tool_notes.push(format!("resolved project_id={project_id}"));
                    continue;
                }
                let _ = pb
                    .update_agent_message(
                        &status_id,
                        &format!("Projects I can use:\n{summary}\n\nTell me which project (name or id) and what to work on."),
                        None,
                        None,
                    )
                    .await;
                return Ok(());
            }
            AgentDecision::CreateAndStart {
                project_id,
                title,
                description,
            } => {
                match create_and_start_task(
                    &deployment,
                    agent,
                    project_id,
                    title.clone(),
                    description,
                )
                .await
                {
                    Ok(created) => {
                        let body = if created.has_in_progress_attempt {
                            format!("Created and started “{}”.", created.task.title)
                        } else {
                            format!(
                                "Created “{}”, but the agent didn’t start. Open the task to retry.",
                                created.task.title
                            )
                        };
                        let _ = pb
                            .update_agent_message(
                                &status_id,
                                &body,
                                Some(&created.task.project_id.to_string()),
                                Some(&created.task.id.to_string()),
                            )
                            .await;
                        return Ok(());
                    }
                    Err(err) => {
                        tool_notes.push(format!("create_and_start_task error: {err}"));
                        let _ = pb
                            .update_agent_message(
                                &status_id,
                                &format!("Couldn't create the task: {err}"),
                                None,
                                None,
                            )
                            .await;
                        return Ok(());
                    }
                }
            }
        }
    }

    let _ = pb
        .update_agent_message(
            &status_id,
            "I got stuck looping on tools. Try again with a project name and a short task title.",
            None,
            None,
        )
        .await;
    Ok(())
}

#[derive(Debug, PartialEq)]
pub(crate) enum AgentDecision {
    Reply(String),
    ListProjects,
    CreateAndStart {
        project_id: Uuid,
        title: String,
        description: Option<String>,
    },
}

async fn decide_next_action(
    agent: &BaseCodingAgent,
    user_message: &str,
    history: &[crate::pocketbase::PbMessage],
    tool_notes: &[String],
    round: usize,
) -> AgentDecision {
    // Prefer a CLI-backed decision for Claude; otherwise use heuristics.
    if *agent == BaseCodingAgent::ClaudeCode {
        if let Ok(Some(decision)) =
            ask_claude_for_decision(user_message, history, tool_notes).await
        {
            return decision;
        }
    }

    heuristic_decision(user_message, tool_notes, round).await
}

async fn ask_claude_for_decision(
    user_message: &str,
    history: &[crate::pocketbase::PbMessage],
    tool_notes: &[String],
) -> anyhow::Result<Option<AgentDecision>> {
    let claude = resolve_executable_path("claude").await;
    let Some(claude) = claude else {
        return Ok(None);
    };

    let history_text = history
        .iter()
        .rev()
        .take(20)
        .rev()
        .map(|m| {
            let who = if !m.author_agent.is_empty() {
                format!("agent:{}", m.author_agent)
            } else if !m.author_user.is_empty() {
                "user".into()
            } else {
                "unknown".into()
            };
            format!("{who}: {}", m.body)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let tools = tool_notes.join("\n");
    let prompt = format!(
        r#"You are collaborating in a Kablan chat. Reply with EXACTLY one JSON object, no markdown.

Allowed shapes:
{{"type":"message","body":"..."}}
{{"type":"list_projects"}}
{{"type":"create_and_start_task","project_id":"<uuid>","title":"...","description":"..."}}

Rules:
- Use list_projects when you need to pick a project and do not know ids/names yet.
- Use create_and_start_task when the user wants work done in a known project.
- Otherwise send a short helpful message.
- Do not invent project UUIDs; only use ids from tool notes or the user message.

Recent chat:
{history_text}

Latest user message:
{user_message}

Tool notes:
{tools}
"#
    );

    let mut cmd = Command::new(claude);
    cmd.arg("-p")
        .arg(&prompt)
        .arg("--output-format")
        .arg("text")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let output = tokio::time::timeout(Duration::from_secs(90), cmd.output()).await??;
    if !output.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(parse_decision_json(&text))
}

pub(crate) fn parse_decision_json(text: &str) -> Option<AgentDecision> {
    // Find first JSON object in the output.
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    let slice = &text[start..=end];
    let value: serde_json::Value = serde_json::from_str(slice).ok()?;
    let ty = value.get("type")?.as_str()?;
    match ty {
        "message" => Some(AgentDecision::Reply(
            value
                .get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        )),
        "list_projects" => Some(AgentDecision::ListProjects),
        "create_and_start_task" => {
            let project_id = value
                .get("project_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok())?;
            let title = value
                .get("title")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())?
                .to_string();
            let description = value
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            Some(AgentDecision::CreateAndStart {
                project_id,
                title,
                description,
            })
        }
        _ => None,
    }
}

async fn heuristic_decision(
    user_message: &str,
    tool_notes: &[String],
    round: usize,
) -> AgentDecision {
    let lower = user_message.to_lowercase();
    let listed = tool_notes.iter().any(|n| n.starts_with("list_projects"));
    let looks_like_task = lower.contains("create")
        || lower.contains("start")
        || lower.contains("task")
        || lower.contains("fix")
        || lower.contains("build")
        || lower.contains("implement");

    if !listed && round == 0 && (looks_like_task || !user_message.trim().is_empty()) {
        // First try listing so we can bind a project; if a UUID is already in the message, create.
        if let Some(id) = extract_uuid(user_message) {
            let title = title_from_message(user_message);
            return AgentDecision::CreateAndStart {
                project_id: id,
                title,
                description: Some(user_message.to_string()),
            };
        }
        if looks_like_task {
            return AgentDecision::ListProjects;
        }
    }

    if listed {
        if let Some(id) = extract_uuid(user_message)
            .or_else(|| {
                tool_notes
                    .iter()
                    .find_map(|n| n.strip_prefix("resolved project_id=").and_then(|s| Uuid::parse_str(s).ok()))
            })
        {
            return AgentDecision::CreateAndStart {
                project_id: id,
                title: title_from_message(user_message),
                description: Some(user_message.to_string()),
            };
        }
        return AgentDecision::Reply(
            "Tell me which project (name or id from the list) and a short title for the task."
                .into(),
        );
    }

    AgentDecision::Reply(
        "I'm here. Ask me to create a task in a project, or say what you want done and I'll pick a project.".into(),
    )
}

fn extract_uuid(s: &str) -> Option<Uuid> {
    let re = regex::Regex::new(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
    )
    .ok()?;
    re.find(s)
        .and_then(|m| Uuid::parse_str(m.as_str()).ok())
}

fn title_from_message(s: &str) -> String {
    let cleaned = s
        .lines()
        .next()
        .unwrap_or(s)
        .trim()
        .trim_start_matches('@')
        .chars()
        .take(80)
        .collect::<String>();
    if cleaned.is_empty() {
        "Chat task".into()
    } else {
        cleaned
    }
}

async fn resolve_project_id(
    deployment: &DeploymentImpl,
    preferred: Option<Uuid>,
    user_message: &str,
    projects: &[Project],
) -> Option<Uuid> {
    if let Some(id) = preferred {
        return Some(id);
    }
    if let Some(id) = extract_uuid(user_message) {
        return Some(id);
    }
    let lower = user_message.to_lowercase();
    projects
        .iter()
        .find(|p| lower.contains(&p.name.to_lowercase()))
        .map(|p| p.id)
        .or_else(|| {
            if projects.len() == 1 {
                Some(projects[0].id)
            } else {
                None
            }
        })
        .or({
            let _ = deployment;
            None
        })
}

async fn create_and_start_task(
    deployment: &DeploymentImpl,
    agent: BaseCodingAgent,
    project_id: Uuid,
    title: String,
    description: Option<String>,
) -> Result<TaskWithAttemptStatus, ApiError> {
    let pool = &deployment.db().pool;
    let repos = ProjectRepo::find_repos_for_project(pool, project_id).await?;
    if repos.is_empty() {
        return Err(ApiError::BadRequest(
            "Project has no repositories".to_string(),
        ));
    }

    let repo_inputs: Vec<WorkspaceRepoInput> = repos
        .iter()
        .map(|r| WorkspaceRepoInput {
            repo_id: r.id,
            target_branch: r
                .default_target_branch
                .clone()
                .unwrap_or_else(|| "main".to_string()),
        })
        .collect();

    let create = CreateTask {
        project_id,
        title,
        description,
        status: None,
        parent_workspace_id: None,
        image_ids: None,
        source_provider: Some("chat".into()),
        source_id: None,
        source_identifier: None,
        source_url: None,
    };

    let task_id = Uuid::new_v4();
    let task = Task::create(pool, &create, task_id).await?;
    if let Some(image_ids) = &create.image_ids {
        TaskImage::associate_many_dedup(pool, task.id, image_ids).await?;
    }

    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_workspace(&attempt_id, &task.title, task.source_identifier.as_deref())
        .await;

    let agent_working_dir = if repo_inputs.len() == 1 {
        let repo = db::models::repo::Repo::find_by_id(pool, repo_inputs[0].repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;
        match repo.default_working_dir {
            Some(subdir) => {
                let path = PathBuf::from(&repo.name).join(&subdir);
                Some(path.to_string_lossy().to_string())
            }
            None => Some(repo.name),
        }
    } else {
        None
    };

    let workspace = Workspace::create(
        pool,
        &CreateWorkspace {
            branch: git_branch_name,
            agent_working_dir,
        },
        attempt_id,
        task.id,
    )
    .await?;

    let workspace_repos: Vec<CreateWorkspaceRepo> = repo_inputs
        .iter()
        .map(|r| CreateWorkspaceRepo {
            repo_id: r.repo_id,
            target_branch: r.target_branch.clone(),
        })
        .collect();
    WorkspaceRepo::create_many(pool, workspace.id, &workspace_repos).await?;

    let executor_profile_id = ExecutorProfileId::new(agent);
    let is_attempt_running = match deployment
        .container()
        .start_workspace(&workspace, executor_profile_id.clone())
        .await
    {
        Ok(_) => true,
        Err(err) => {
            // Leave the task in the never-started state so the UI shows Start, not a blank
            // conversation for a workspace that never got a session or processes.
            tracing::error!("Failed to start chat-created task: {err}");
            if let Err(delete_err) = Workspace::delete(pool, workspace.id).await {
                tracing::error!(
                    "Failed to roll back workspace {} after start failure: {delete_err}",
                    workspace.id
                );
            }
            false
        }
    };

    let task = Task::find_by_id(pool, task.id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    let created = TaskWithAttemptStatus {
        task,
        has_in_progress_attempt: is_attempt_running,
        last_attempt_failed: false,
        has_running_dev_server: false,
        has_unseen_turns: false,
        last_turn_summary: None,
        last_turn_prompt: None,
        executor: executor_profile_id.executor.to_string(),
    };
    deployment
        .events()
        .msg_store()
        .push_patch(task_patch::add(&created));
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_message_decision() {
        let d = parse_decision_json(r#"here you go {"type":"message","body":"hi"} thanks"#)
            .expect("parsed");
        assert_eq!(d, AgentDecision::Reply("hi".into()));
    }

    #[test]
    fn parses_list_projects() {
        let d = parse_decision_json(r#"{"type":"list_projects"}"#).expect("parsed");
        assert_eq!(d, AgentDecision::ListProjects);
    }

    #[test]
    fn parses_create_and_start() {
        let id = Uuid::nil();
        let raw = format!(
            r#"{{"type":"create_and_start_task","project_id":"{id}","title":"Fix login","description":"details"}}"#
        );
        let d = parse_decision_json(&raw).expect("parsed");
        assert_eq!(
            d,
            AgentDecision::CreateAndStart {
                project_id: id,
                title: "Fix login".into(),
                description: Some("details".into()),
            }
        );
    }

    #[test]
    fn agent_alias_claude() {
        assert_eq!(
            BaseCodingAgent::from_str_loose("Claude").unwrap(),
            BaseCodingAgent::ClaudeCode
        );
        assert_eq!(
            BaseCodingAgent::from_str_loose("claude-code").unwrap(),
            BaseCodingAgent::ClaudeCode
        );
    }
}
