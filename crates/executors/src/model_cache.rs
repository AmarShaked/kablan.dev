use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::{
    executors::{BaseCodingAgent, CodingAgent, StandardCodingAgentExecutor},
    selection::agent_json_key,
};

/// One model the installed agent can run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct ListedModel {
    pub id: String,
    pub label: String,
    pub featured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct AgentModelList {
    pub models: Vec<ListedModel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// On-disk cache. `fetched_on` is the server machine's local calendar date.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct ModelCacheFile {
    pub fetched_on: String,
    pub agents: BTreeMap<String, AgentModelList>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct ModelCacheResponse {
    pub ready: bool,
    pub fetched_on: Option<String>,
    pub agents: BTreeMap<String, AgentModelList>,
}

pub fn read_cache(path: &Path) -> Option<ModelCacheFile> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn cache_response(path: &Path, today: &str) -> ModelCacheResponse {
    match read_cache(path) {
        Some(file) => ModelCacheResponse {
            ready: file.fetched_on == today,
            fetched_on: Some(file.fetched_on),
            agents: file.agents,
        },
        None => ModelCacheResponse {
            ready: false,
            fetched_on: None,
            agents: BTreeMap::new(),
        },
    }
}

/// Fetch only when the file is missing or from another local day.
/// Agents that are not in `installed` are left out. A fetch error is stored for today.
pub fn refresh_model_cache<F>(
    path: &Path,
    today: &str,
    installed: &[BaseCodingAgent],
    mut fetch: F,
) -> ModelCacheFile
where
    F: FnMut(BaseCodingAgent) -> Result<Vec<ListedModel>, String>,
{
    if let Some(existing) = read_cache(path)
        && existing.fetched_on == today
    {
        return existing;
    }

    let mut agents = BTreeMap::new();
    for agent in installed {
        let entry = match fetch(*agent) {
            Ok(models) => AgentModelList {
                models,
                error: None,
            },
            Err(error) => AgentModelList {
                models: Vec::new(),
                error: Some(error),
            },
        };
        agents.insert(agent_json_key(*agent).to_string(), entry);
    }
    let file = ModelCacheFile {
        fetched_on: today.to_string(),
        agents,
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(raw) = serde_json::to_string_pretty(&file) {
        let _ = fs::write(path, raw);
    }
    file
}

/// `true` when the menu should show a "More models" row.
pub fn has_more_models(models: &[ListedModel]) -> bool {
    models.iter().any(|model| model.featured) && models.iter().any(|model| !model.featured)
}

pub fn parse_claude_catalog(raw: &str) -> Result<Vec<ListedModel>, String> {
    let value: Value = serde_json::from_str(raw).map_err(|err| err.to_string())?;
    let models = value
        .pointer("/catalog/config/models")
        .and_then(Value::as_array)
        .ok_or_else(|| "Claude catalog has no models".to_string())?;
    let listed = models
        .iter()
        .filter_map(|model| {
            let id = model.get("id")?.as_str()?.trim();
            if id.is_empty() {
                return None;
            }
            let label = model
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(id)
                .to_string();
            let featured = model.get("section").and_then(Value::as_str) == Some("main");
            Some(ListedModel {
                id: id.to_string(),
                label,
                featured,
            })
        })
        .collect::<Vec<_>>();
    if listed.is_empty() {
        return Err("Claude catalog has no models".to_string());
    }
    Ok(listed)
}

pub fn parse_cursor_model_list(raw: &str) -> Vec<ListedModel> {
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.eq_ignore_ascii_case("Available models") {
                return None;
            }
            let (id, label) = line.split_once(" - ")?;
            let id = id.trim();
            if id.is_empty() {
                return None;
            }
            Some(ListedModel {
                id: id.to_string(),
                label: label.trim().to_string(),
                featured: true,
            })
        })
        .collect()
}

pub fn installed_agents() -> Vec<BaseCodingAgent> {
    [
        BaseCodingAgent::ClaudeCode,
        BaseCodingAgent::Amp,
        BaseCodingAgent::Gemini,
        #[cfg(feature = "codex")]
        BaseCodingAgent::Codex,
        BaseCodingAgent::Opencode,
        BaseCodingAgent::CursorAgent,
        BaseCodingAgent::QwenCode,
        BaseCodingAgent::Copilot,
        BaseCodingAgent::Droid,
    ]
    .into_iter()
    .filter(|agent| agent_is_installed(*agent))
    .collect()
}

fn agent_is_installed(agent: BaseCodingAgent) -> bool {
    let Ok(coding) = empty_agent(agent) else {
        return false;
    };
    coding.get_availability_info().is_available()
}

fn empty_agent(agent: BaseCodingAgent) -> Result<CodingAgent, String> {
    let value = serde_json::json!({ agent_json_key(agent): {} });
    serde_json::from_value(value).map_err(|err| err.to_string())
}

pub fn fetch_agent_models(agent: BaseCodingAgent) -> Result<Vec<ListedModel>, String> {
    match agent {
        BaseCodingAgent::ClaudeCode => read_claude_catalog(),
        BaseCodingAgent::CursorAgent => {
            let output = Command::new("agent")
                .arg("--list-models")
                .output()
                .map_err(|err| format!("Cursor agent --list-models failed: {err}"))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Cursor agent --list-models failed: {stderr}"));
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            let models = parse_cursor_model_list(&stdout);
            if models.is_empty() {
                return Err("Cursor agent returned no models".to_string());
            }
            Ok(models)
        }
        other => Err(format!(
            "{other} does not expose a model list from its installed CLI"
        )),
    }
}

fn read_claude_catalog() -> Result<Vec<ListedModel>, String> {
    let dir = claude_catalog_dir().ok_or_else(|| {
        "Claude has not written a model catalog yet".to_string()
    })?;
    let newest = newest_catalog_file(&dir).ok_or_else(|| {
        "Claude has not written a model catalog yet".to_string()
    })?;
    let raw = fs::read_to_string(&newest).map_err(|err| err.to_string())?;
    parse_claude_catalog(&raw)
}

fn claude_catalog_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".claude").join("cache").join("model-catalog"))
}

fn newest_catalog_file(dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
        .filter(|path| path.is_file())
        .max_by_key(|path| {
            fs::metadata(path)
                .and_then(|meta| meta.modified())
                .ok()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "kablan-model-cache-{}-{name}.json",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);
        path
    }

    #[test]
    fn a_cache_dated_today_does_not_call_the_fetcher() {
        let path = temp_path("today");
        let installed = [BaseCodingAgent::ClaudeCode];
        refresh_model_cache(&path, "2026-10-21", &installed, |_| {
            Ok(vec![ListedModel {
                id: "claude-opus-5-5".into(),
                label: "Opus 5.5".into(),
                featured: true,
            }])
        });
        let mut calls = 0;
        refresh_model_cache(&path, "2026-10-21", &installed, |_| {
            calls += 1;
            Err("should not run".into())
        });
        assert_eq!(calls, 0);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn a_cache_from_yesterday_refetches_and_rewrites_the_date() {
        let path = temp_path("yesterday");
        let installed = [BaseCodingAgent::ClaudeCode, BaseCodingAgent::CursorAgent];
        refresh_model_cache(&path, "2026-10-20", &installed, |_| Ok(vec![]));
        let mut calls = 0;
        let file = refresh_model_cache(&path, "2026-10-21", &installed, |agent| {
            calls += 1;
            Ok(vec![ListedModel {
                id: agent_json_key(agent).into(),
                label: "Model".into(),
                featured: true,
            }])
        });
        assert_eq!(calls, 2);
        assert_eq!(file.fetched_on, "2026-10-21");
        assert!(file.agents.contains_key("CLAUDE_CODE"));
        assert!(file.agents.contains_key("CURSOR_AGENT"));
        assert!(!file.agents.contains_key("GEMINI"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn a_fetch_error_is_stored_and_not_retried_the_same_day() {
        let path = temp_path("error");
        let installed = [BaseCodingAgent::Gemini];
        let file = refresh_model_cache(&path, "2026-10-21", &installed, |_| {
            Err("gemini exited".into())
        });
        assert_eq!(
            file.agents["GEMINI"].error.as_deref(),
            Some("gemini exited")
        );
        assert!(file.agents["GEMINI"].models.is_empty());
        let mut calls = 0;
        refresh_model_cache(&path, "2026-10-21", &installed, |_| {
            calls += 1;
            Ok(vec![])
        });
        assert_eq!(calls, 0);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn claude_main_models_are_featured_and_overflow_is_more_models() {
        let raw = r#"{
            "catalog": { "config": { "models": [
                {"id": "claude-opus-5-5", "name": "Opus 5.5", "section": "main"},
                {"id": "claude-opus-4-8", "name": "Opus 4.8", "section": "overflow"}
            ]}}
        }"#;
        let models = parse_claude_catalog(raw).unwrap();
        assert!(has_more_models(&models));
        assert!(models[0].featured);
        assert!(!models[1].featured);
    }

    #[test]
    fn a_flat_list_has_no_more_models_row() {
        let models = parse_cursor_model_list("Available models\n\nauto - Auto\ncomposer-2.5 - Composer 2.5\n");
        assert_eq!(models.len(), 2);
        assert!(models.iter().all(|model| model.featured));
        assert!(!has_more_models(&models));
    }

    #[test]
    fn a_missing_cache_is_not_ready() {
        let path = temp_path("missing");
        let response = cache_response(&path, "2026-10-21");
        assert!(!response.ready);
        assert!(response.agents.is_empty());
    }
}
