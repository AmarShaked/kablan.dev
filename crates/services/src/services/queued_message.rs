use std::sync::Arc;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use db::models::scratch::DraftFollowUpData;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Represents a queued follow-up message for a session
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct QueuedMessage {
    /// Stable id so a single item can be cancelled without dropping the rest
    pub id: Uuid,
    /// The session this message is queued for
    pub session_id: Uuid,
    /// The follow-up data (message + variant)
    pub data: DraftFollowUpData,
    /// Timestamp when the message was queued
    pub queued_at: DateTime<Utc>,
}

/// Status of the queue for a session (for frontend display)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
#[ts(export)]
pub enum QueueStatus {
    /// No message queued
    Empty,
    /// Messages waiting for the current execution to finish, oldest first
    Queued { messages: Vec<QueuedMessage> },
}

/// In-memory service for managing queued follow-up messages.
/// FIFO list per session.
#[derive(Clone)]
pub struct QueuedMessageService {
    queue: Arc<DashMap<Uuid, Vec<QueuedMessage>>>,
}

impl QueuedMessageService {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(DashMap::new()),
        }
    }

    /// Append a follow-up to the session queue.
    pub fn queue_message(&self, session_id: Uuid, data: DraftFollowUpData) -> QueuedMessage {
        let queued = QueuedMessage {
            id: Uuid::new_v4(),
            session_id,
            data,
            queued_at: Utc::now(),
        };
        self.queue
            .entry(session_id)
            .or_default()
            .push(queued.clone());
        queued
    }

    /// Drop every queued message for a session.
    pub fn cancel_queued(&self, session_id: Uuid) -> Vec<QueuedMessage> {
        self.queue
            .remove(&session_id)
            .map(|(_, v)| v)
            .unwrap_or_default()
    }

    /// Remove one queued message, leaving the rest in order.
    pub fn cancel_queued_id(&self, session_id: Uuid, message_id: Uuid) -> Option<QueuedMessage> {
        let mut empty = false;
        let removed = self.queue.get_mut(&session_id).and_then(|mut messages| {
            let idx = messages.iter().position(|m| m.id == message_id)?;
            let msg = messages.remove(idx);
            empty = messages.is_empty();
            Some(msg)
        });
        if empty {
            self.queue.remove(&session_id);
        }
        removed
    }

    /// Oldest queued message, if any.
    pub fn get_queued(&self, session_id: Uuid) -> Option<QueuedMessage> {
        self.queue
            .get(&session_id)
            .and_then(|messages| messages.first().cloned())
    }

    /// Pop the oldest queued message. Remaining items stay queued.
    pub fn take_queued(&self, session_id: Uuid) -> Option<QueuedMessage> {
        let mut empty = false;
        let taken = self.queue.get_mut(&session_id).and_then(|mut messages| {
            if messages.is_empty() {
                empty = true;
                None
            } else {
                let msg = messages.remove(0);
                empty = messages.is_empty();
                Some(msg)
            }
        });
        if empty {
            self.queue.remove(&session_id);
        }
        taken
    }

    /// Check if a session has any queued messages
    pub fn has_queued(&self, session_id: Uuid) -> bool {
        self.queue
            .get(&session_id)
            .is_some_and(|messages| !messages.is_empty())
    }

    /// Get queue status for frontend display
    pub fn get_status(&self, session_id: Uuid) -> QueueStatus {
        match self.queue.get(&session_id) {
            Some(messages) if !messages.is_empty() => QueueStatus::Queued {
                messages: messages.clone(),
            },
            _ => QueueStatus::Empty,
        }
    }
}

impl Default for QueuedMessageService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};

    use super::*;

    fn draft(message: &str) -> DraftFollowUpData {
        DraftFollowUpData {
            message: message.to_string(),
            executor_profile_id: ExecutorProfileId {
                executor: BaseCodingAgent::ClaudeCode,
                variant: None,
            },
        }
    }

    fn messages(status: QueueStatus) -> Vec<String> {
        match status {
            QueueStatus::Empty => vec![],
            QueueStatus::Queued { messages } => {
                messages.into_iter().map(|m| m.data.message).collect()
            }
        }
    }

    #[test]
    fn queue_appends_instead_of_replacing() {
        let svc = QueuedMessageService::new();
        let session = Uuid::new_v4();
        svc.queue_message(session, draft("first"));
        svc.queue_message(session, draft("second"));
        svc.queue_message(session, draft("third"));

        assert_eq!(
            messages(svc.get_status(session)),
            vec!["first", "second", "third"]
        );
    }

    #[test]
    fn take_queued_pops_the_oldest_message() {
        let svc = QueuedMessageService::new();
        let session = Uuid::new_v4();
        svc.queue_message(session, draft("first"));
        svc.queue_message(session, draft("second"));

        let taken = svc.take_queued(session).expect("queued");
        assert_eq!(taken.data.message, "first");
        assert_eq!(messages(svc.get_status(session)), vec!["second"]);
    }

    #[test]
    fn cancel_one_leaves_the_rest() {
        let svc = QueuedMessageService::new();
        let session = Uuid::new_v4();
        svc.queue_message(session, draft("first"));
        let second = svc.queue_message(session, draft("second"));
        svc.queue_message(session, draft("third"));

        svc.cancel_queued_id(session, second.id);
        assert_eq!(messages(svc.get_status(session)), vec!["first", "third"]);
    }

    #[test]
    fn cancel_all_clears_the_session() {
        let svc = QueuedMessageService::new();
        let session = Uuid::new_v4();
        svc.queue_message(session, draft("first"));
        svc.queue_message(session, draft("second"));

        svc.cancel_queued(session);
        assert!(matches!(svc.get_status(session), QueueStatus::Empty));
        assert!(!svc.has_queued(session));
    }
}
