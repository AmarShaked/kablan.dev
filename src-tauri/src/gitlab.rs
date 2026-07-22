//! GitLab integration (desktop-only). Resolves a repo's origin remote to a
//! GitLab host + project, reads a per-host PAT from the OS keychain, and calls
//! the GitLab REST API. Never logs or returns the token.
use crate::git;

#[derive(Debug, PartialEq, Eq)]
pub struct Remote {
    pub host: String,
    pub project: String,
}

/// Parse a GitLab remote URL into host + project path. Handles ssh, ssh://, and
/// https forms. Returns None for anything unrecognized.
pub fn parse_remote(url: &str) -> Option<Remote> {
    let url = url.trim();
    let (host, path) = if let Some(rest) = url.strip_prefix("git@") {
        // git@host:group/proj.git
        let (host, path) = rest.split_once(':')?;
        (host.to_string(), path.to_string())
    } else if let Some(rest) = url.strip_prefix("ssh://") {
        // ssh://git@host[:port]/group/proj.git
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (authority, path) = rest.split_once('/')?;
        let host = authority.split(':').next()?.to_string();
        (host, path.to_string())
    } else if let Some(rest) = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://")) {
        // https://[user@]host/group/proj.git
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (authority, path) = rest.split_once('/')?;
        let host = authority.split(':').next()?.to_string();
        (host, path.to_string())
    } else {
        return None;
    };
    let project = path.trim_start_matches('/').trim_end_matches('/').strip_suffix(".git").unwrap_or(
        path.trim_start_matches('/').trim_end_matches('/'),
    );
    if host.is_empty() || project.is_empty() {
        return None;
    }
    Some(Remote { host: host.to_lowercase(), project: project.to_string() })
}

/// Resolve the origin remote of `dir` to a GitLab Remote (None if no origin).
pub fn resolve(dir: &str) -> Option<Remote> {
    let url = git::git(dir, &["remote", "get-url", "origin"]).ok()?;
    parse_remote(&url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssh_https_and_nested_paths() {
        let cases = [
            ("git@gitlab.com:group/proj.git", "gitlab.com", "group/proj"),
            ("git@gl.example.com:group/sub/proj.git", "gl.example.com", "group/sub/proj"),
            ("ssh://git@gitlab.com:22/group/proj.git", "gitlab.com", "group/proj"),
            ("https://gitlab.com/group/proj.git", "gitlab.com", "group/proj"),
            ("https://oauth2:tok@gl.example.com/group/proj", "gl.example.com", "group/proj"),
        ];
        for (url, host, project) in cases {
            let r = parse_remote(url).unwrap_or_else(|| panic!("failed: {url}"));
            assert_eq!(r.host, host, "{url}");
            assert_eq!(r.project, project, "{url}");
        }
    }

    #[test]
    fn rejects_unknown() {
        assert!(parse_remote("").is_none());
        assert!(parse_remote("not a url").is_none());
    }
}
