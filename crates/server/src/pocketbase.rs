//! PocketBase client for chat agent posts (hosted service account).

use anyhow::{Context, Result, anyhow};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Hosted Chats backend. Override with `POCKETBASE_URL`.
pub const DEFAULT_POCKETBASE_URL: &str = "https://kablan-pocketbase.fly.dev";

/// Must match `deploy/pocketbase/pb_migrations/1730000002_agent_service_account.js`.
pub const DEFAULT_POCKETBASE_SERVICE_EMAIL: &str = "agent@kablan.service";

/// Must match the migration that creates the service user. Override with
/// `POCKETBASE_SERVICE_PASSWORD` when self-hosting.
pub const DEFAULT_POCKETBASE_SERVICE_PASSWORD: &str =
    "V6VI1lm2q25/EwPOpANAXN+2OyncQwUCFL31n53GW8A=";

#[derive(Clone)]
pub struct PocketBaseClient {
    http: Client,
    base_url: String,
    token: String,
}

#[derive(Debug, Deserialize)]
struct AuthResponse {
    token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PbMessage {
    pub id: String,
    pub chat: String,
    pub author_user: String,
    pub author_agent: String,
    pub body: String,
    #[serde(default)]
    pub mentions: Option<Value>,
    #[serde(default)]
    pub task_project_id: Option<String>,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub created: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListResponse<T> {
    items: Vec<T>,
}

impl PocketBaseClient {
    /// Always available for the hosted product (baked-in defaults).
    /// Self-hosters override URL / password via env.
    pub fn is_configured() -> bool {
        true
    }

    pub async fn from_env() -> Result<Self> {
        let base_url = std::env::var("POCKETBASE_URL")
            .unwrap_or_else(|_| DEFAULT_POCKETBASE_URL.to_string())
            .trim_end_matches('/')
            .to_string();
        let email = std::env::var("POCKETBASE_SERVICE_EMAIL")
            .unwrap_or_else(|_| DEFAULT_POCKETBASE_SERVICE_EMAIL.to_string());
        let password = std::env::var("POCKETBASE_SERVICE_PASSWORD")
            .unwrap_or_else(|_| DEFAULT_POCKETBASE_SERVICE_PASSWORD.to_string());

        let http = Client::new();
        let token = Self::authenticate(&http, &base_url, &email, &password)
            .await
            .with_context(|| {
                format!("PocketBase service auth failed for {email} at {base_url}")
            })?;
        Ok(Self {
            http,
            base_url,
            token,
        })
    }

    async fn authenticate(
        http: &Client,
        base_url: &str,
        email: &str,
        password: &str,
    ) -> Result<String> {
        let body = serde_json::json!({ "identity": email, "password": password });
        let res = http
            .post(format!(
                "{base_url}/api/collections/users/auth-with-password"
            ))
            .json(&body)
            .send()
            .await
            .context("PocketBase auth request failed")?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!(
                "service user login failed ({status}): {text}"
            ));
        }
        let auth: AuthResponse = res.json().await?;
        Ok(auth.token)
    }

    async fn authed(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{}{path}", self.base_url))
            .header("Authorization", format!("Bearer {}", self.token))
    }

    pub async fn get_message(&self, message_id: &str) -> Result<PbMessage> {
        let res = self
            .authed(
                reqwest::Method::GET,
                &format!("/api/collections/messages/records/{message_id}"),
            )
            .await
            .send()
            .await?;
        if !res.status().is_success() {
            return Err(anyhow!(
                "Failed to load message {message_id}: {}",
                res.status()
            ));
        }
        Ok(res.json().await?)
    }

    pub async fn list_messages(&self, chat_id: &str, limit: u32) -> Result<Vec<PbMessage>> {
        let filter = urlencoding_filter(&format!("chat = \"{chat_id}\""));
        let path = format!(
            "/api/collections/messages/records?page=1&perPage={limit}&sort=created&filter={filter}"
        );
        let res = self.authed(reqwest::Method::GET, &path).await.send().await?;
        if !res.status().is_success() {
            return Err(anyhow!("Failed to list messages: {}", res.status()));
        }
        let list: ListResponse<PbMessage> = res.json().await?;
        Ok(list.items)
    }

    pub async fn create_agent_message(
        &self,
        chat_id: &str,
        author_agent: &str,
        body: &str,
        task_project_id: Option<&str>,
        task_id: Option<&str>,
    ) -> Result<PbMessage> {
        let mut payload = serde_json::json!({
            "chat": chat_id,
            "author_agent": author_agent,
            "body": body,
        });
        if let Some(pid) = task_project_id.filter(|s| !s.is_empty()) {
            payload["task_project_id"] = Value::String(pid.to_string());
        }
        if let Some(tid) = task_id.filter(|s| !s.is_empty()) {
            payload["task_id"] = Value::String(tid.to_string());
        }
        let res = self
            .authed(reqwest::Method::POST, "/api/collections/messages/records")
            .await
            .json(&payload)
            .send()
            .await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to create agent message ({status}): {text}"));
        }
        Ok(res.json().await?)
    }

    pub async fn update_agent_message(
        &self,
        message_id: &str,
        body: &str,
        task_project_id: Option<&str>,
        task_id: Option<&str>,
    ) -> Result<PbMessage> {
        let mut payload = serde_json::json!({ "body": body });
        if let Some(pid) = task_project_id.filter(|s| !s.is_empty()) {
            payload["task_project_id"] = Value::String(pid.to_string());
        }
        if let Some(tid) = task_id.filter(|s| !s.is_empty()) {
            payload["task_id"] = Value::String(tid.to_string());
        }
        let res = self
            .authed(
                reqwest::Method::PATCH,
                &format!("/api/collections/messages/records/{message_id}"),
            )
            .await
            .json(&payload)
            .send()
            .await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to update agent message ({status}): {text}"));
        }
        Ok(res.json().await?)
    }

    pub async fn delete_message(&self, message_id: &str) -> Result<()> {
        let res = self
            .authed(
                reqwest::Method::DELETE,
                &format!("/api/collections/messages/records/{message_id}"),
            )
            .await
            .send()
            .await?;
        if !res.status().is_success() {
            return Err(anyhow!(
                "Failed to delete message {message_id}: {}",
                res.status()
            ));
        }
        Ok(())
    }
}

fn urlencoding_filter(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosted_defaults_are_set() {
        assert!(PocketBaseClient::is_configured());
        assert!(DEFAULT_POCKETBASE_URL.starts_with("https://"));
        assert!(DEFAULT_POCKETBASE_SERVICE_EMAIL.contains('@'));
        assert!(!DEFAULT_POCKETBASE_SERVICE_PASSWORD.is_empty());
    }
}
