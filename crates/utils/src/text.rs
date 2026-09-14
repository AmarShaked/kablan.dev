use regex::Regex;
use uuid::Uuid;

pub fn git_branch_id(input: &str) -> String {
    git_branch_id_max(input, 16)
}

pub fn git_branch_id_max(input: &str, max_chars: usize) -> String {
    // 1. lowercase
    let lower = input.to_lowercase();

    // 2. replace non-alphanumerics with hyphens
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let slug = re.replace_all(&lower, "-");

    // 3. trim extra hyphens
    let trimmed = slug.trim_matches('-');

    // 4. take up to max_chars, then trim trailing hyphens again
    let cut: String = trimmed.chars().take(max_chars).collect();
    cut.trim_end_matches('-').to_string()
}

/// Branch for a workspace: `kablan/{uuid}-{slug}`, or `kablan/{IDENTIFIER}` when the task
/// came from an external ticket (e.g. Linear `FE-123` → `kablan/FE-123`).
pub fn git_workspace_branch(
    prefix: &str,
    workspace_id: &Uuid,
    task_title: &str,
    source_identifier: Option<&str>,
) -> String {
    let slug = match source_identifier.map(str::trim).filter(|s| !s.is_empty()) {
        Some(identifier) => ticket_branch_id(identifier),
        None => format!("{}-{}", short_uuid(workspace_id), git_branch_id(task_title)),
    };

    if prefix.is_empty() {
        slug
    } else {
        format!("{prefix}/{slug}")
    }
}

/// Keep Linear-style identifiers readable in the branch: `FE-123`, not `fe-123-title-slug`.
fn ticket_branch_id(identifier: &str) -> String {
    let upper = identifier.trim().to_uppercase();
    let re = Regex::new(r"[^A-Z0-9]+").unwrap();
    let slug = re.replace_all(&upper, "-");
    slug.trim_matches('-').chars().take(64).collect::<String>()
}

pub fn short_uuid(u: &Uuid) -> String {
    // to_simple() gives you a 32-char hex string with no hyphens
    let full = u.simple().to_string();
    full.chars().take(4).collect() // grab the first 4 chars
}

pub fn truncate_to_char_boundary(content: &str, max_len: usize) -> &str {
    if content.len() <= max_len {
        return content;
    }

    let cutoff = content
        .char_indices()
        .map(|(idx, _)| idx)
        .chain(std::iter::once(content.len()))
        .take_while(|&idx| idx <= max_len)
        .last()
        .unwrap_or(0);

    debug_assert!(content.is_char_boundary(cutoff));
    &content[..cutoff]
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{git_workspace_branch, truncate_to_char_boundary};

    #[test]
    fn workspace_branch_uses_short_uuid_without_a_ticket() {
        let id = Uuid::parse_str("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee").unwrap();
        assert_eq!(
            git_workspace_branch("kablan", &id, "Fix login redirect", None),
            "kablan/aaaa-fix-login-redire"
        );
    }

    #[test]
    fn workspace_branch_uses_linear_identifier_instead_of_uuid() {
        let id = Uuid::parse_str("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee").unwrap();
        assert_eq!(
            git_workspace_branch(
                "kablan",
                &id,
                "ENG-214 Fix login redirect after SSO",
                Some("ENG-214")
            ),
            "kablan/ENG-214"
        );
        assert_eq!(
            git_workspace_branch("kablan", &id, "Something else", Some("fe-123")),
            "kablan/FE-123"
        );
    }

    #[test]
    fn test_truncate_to_char_boundary() {
        let input = "a".repeat(10);
        assert_eq!(truncate_to_char_boundary(&input, 7), "a".repeat(7));

        let input = "hello world";
        assert_eq!(truncate_to_char_boundary(input, input.len()), input);

        let input = "🔥🔥🔥"; // each fire emoji is 4 bytes
        assert_eq!(truncate_to_char_boundary(input, 5), "🔥");
        assert_eq!(truncate_to_char_boundary(input, 3), "");
    }
}
