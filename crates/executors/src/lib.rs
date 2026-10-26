// `default_profiles.json` embeds a CODEX entry, and `ExecutorConfigs::from_defaults` panics on
// an executor key the binary was not built with — so a `--no-default-features` build fails at
// server boot, in front of the user, rather than at build time. Fail here instead, where the
// message can say what to do about it.
#[cfg(not(feature = "codex"))]
compile_error!(
    "the `codex` feature is required: default_profiles.json has a CODEX entry that will not \
     parse without it, and the panic lands on first run. To build without Codex you have to \
     drop that entry from default_profiles.json in the same change."
);

pub mod actions;
pub mod approvals;
pub mod command;
pub mod env;
pub mod executors;
pub mod logs;
pub mod mcp_config;
pub mod model_cache;
pub mod profile;
pub mod selection;
pub mod stdout_dup;
