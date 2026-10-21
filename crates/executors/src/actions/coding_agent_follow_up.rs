use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[cfg(not(feature = "qa-mode"))]
use crate::selection::{resolve_coding_agent, selection_asks_in_app};
use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    env::ExecutionEnv,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    profile::ExecutorProfileId,
    selection::AgentRunSelection,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentFollowUpRequest {
    pub prompt: String,
    pub session_id: String,
    #[serde(default)]
    pub reset_to_message_id: Option<String>,
    /// Executor profile specification
    #[serde(alias = "profile_variant_label")]
    // Backwards compatibility with ProfileVariantIds, esp stored in DB under ExecutorAction
    pub executor_profile_id: ExecutorProfileId,
    /// Model and permission for this run. Absent on actions stored before profiles were removed.
    #[serde(default)]
    pub agent_selection: Option<AgentRunSelection>,
    /// Optional relative path to execute the agent in (relative to container_ref).
    /// If None, uses the container_ref directory directly.
    #[serde(default)]
    pub working_dir: Option<String>,
}

impl CodingAgentFollowUpRequest {
    /// Get the executor profile ID
    pub fn get_executor_profile_id(&self) -> ExecutorProfileId {
        self.executor_profile_id.clone()
    }

    pub fn effective_dir(&self, current_dir: &Path) -> std::path::PathBuf {
        match &self.working_dir {
            Some(rel_path) => current_dir.join(rel_path),
            None => current_dir.to_path_buf(),
        }
    }

    pub fn base_executor(&self) -> BaseCodingAgent {
        self.agent_selection
            .as_ref()
            .map(|selection| selection.executor)
            .unwrap_or(self.executor_profile_id.executor)
    }
}

#[async_trait]
impl Executable for CodingAgentFollowUpRequest {
    #[cfg_attr(feature = "qa-mode", allow(unused_variables))]
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let effective_dir = self.effective_dir(current_dir);

        #[cfg(feature = "qa-mode")]
        {
            tracing::info!("QA mode: using mock executor for follow-up instead of real agent");
            let executor = crate::executors::qa_mock::QaMockExecutor;
            return executor
                .spawn_follow_up(
                    &effective_dir,
                    &self.prompt,
                    &self.session_id,
                    self.reset_to_message_id.as_deref(),
                    env,
                )
                .await;
        }

        #[cfg(not(feature = "qa-mode"))]
        {
            let mut agent = resolve_coding_agent(
                self.agent_selection.as_ref(),
                &self.executor_profile_id,
            )
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
                .spawn_follow_up(
                    &effective_dir,
                    &self.prompt,
                    &self.session_id,
                    self.reset_to_message_id.as_deref(),
                    env,
                )
                .await
        }
    }
}
