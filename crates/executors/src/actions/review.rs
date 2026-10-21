use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    env::ExecutionEnv,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    profile::ExecutorProfileId,
    selection::{AgentRunSelection, resolve_coding_agent, selection_asks_in_app},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct RepoReviewContext {
    pub repo_id: Uuid,
    pub repo_name: String,
    pub base_commit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ReviewRequest {
    pub executor_profile_id: ExecutorProfileId,
    #[serde(default)]
    pub agent_selection: Option<AgentRunSelection>,
    pub context: Option<Vec<RepoReviewContext>>,
    pub prompt: String,
    /// Optional session ID to resume an existing session
    #[serde(default)]
    pub session_id: Option<String>,
    /// Optional relative path to execute the agent in (relative to container_ref).
    #[serde(default)]
    pub working_dir: Option<String>,
}

impl ReviewRequest {
    pub fn base_executor(&self) -> BaseCodingAgent {
        self.agent_selection
            .as_ref()
            .map(|selection| selection.executor)
            .unwrap_or(self.executor_profile_id.executor)
    }

    pub fn effective_dir(&self, current_dir: &Path) -> std::path::PathBuf {
        match &self.working_dir {
            Some(rel_path) => current_dir.join(rel_path),
            None => current_dir.to_path_buf(),
        }
    }
}

#[async_trait]
impl Executable for ReviewRequest {
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Use working_dir if specified, otherwise use current_dir
        let effective_dir = match &self.working_dir {
            Some(rel_path) => current_dir.join(rel_path),
            None => current_dir.to_path_buf(),
        };

        let mut agent =
            resolve_coding_agent(self.agent_selection.as_ref(), &self.executor_profile_id)
                .map_err(ExecutorError::UnknownExecutorType)?;
        let attach_approvals = self
            .agent_selection
            .as_ref()
            .map(selection_asks_in_app)
            .unwrap_or(true);
        if attach_approvals {
            agent.use_approvals(approvals.clone());
        }

        agent
            .spawn_review(
                &effective_dir,
                &self.prompt,
                self.session_id.as_deref(),
                env,
            )
            .await
    }
}
