use semver::Version;

/// The current application version from Cargo.toml
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// What start-up found when it compared the version in the config against the running one.
///
/// Only [`VersionChange::Upgraded`] is something to tell the user about — the dialog says "We've
/// updated Kablan!", which is a lie for a downgrade and for a first install.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VersionChange {
    /// Nothing recorded yet: a fresh install, not an upgrade.
    FirstRun,
    /// Same version as the last run.
    Unchanged,
    /// Moved forward.
    Upgraded,
    /// Moved back, or between two versions that cannot be ordered because one of them does not
    /// parse as semver (a hand-edited config, or a build whose version is not a release).
    Other,
}

impl VersionChange {
    /// Whether this is the kind of change the release-notes dialog is about.
    pub fn shows_release_notes(self) -> bool {
        self == VersionChange::Upgraded
    }
}

/// Classifies the move from the version last written to the config to the running one.
pub fn classify_change(stored: Option<&str>, current: &str) -> VersionChange {
    let Some(stored) = stored else {
        return VersionChange::FirstRun;
    };
    if stored == current {
        return VersionChange::Unchanged;
    }
    match (Version::parse(stored), Version::parse(current)) {
        (Ok(stored), Ok(current)) if stored < current => VersionChange::Upgraded,
        _ => VersionChange::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_run_has_no_release_notes() {
        let change = classify_change(None, "0.11.7");
        assert_eq!(change, VersionChange::FirstRun);
        assert!(!change.shows_release_notes());
    }

    #[test]
    fn same_version_is_unchanged() {
        let change = classify_change(Some("0.11.7"), "0.11.7");
        assert_eq!(change, VersionChange::Unchanged);
        assert!(!change.shows_release_notes());
    }

    #[test]
    fn upgrade_shows_release_notes() {
        assert!(classify_change(Some("0.11.6"), "0.11.7").shows_release_notes());
        assert!(classify_change(Some("0.11.7"), "0.12.0").shows_release_notes());
    }

    /// The case this whole change exists for: every config written by a released build so far
    /// holds 0.1.8, because the crates were never bumped alongside the npm version.
    #[test]
    fn upgrade_from_the_frozen_version_shows_release_notes() {
        assert!(classify_change(Some("0.1.8"), APP_VERSION).shows_release_notes());
    }

    /// 0.1.8 vs 0.11.7 is the pair that string ordering gets wrong: "0.1.8" > "0.11.7"
    /// lexically, because '8' > '1'. Only numeric semver ordering sees the upgrade.
    #[test]
    fn ordering_is_numeric_not_lexical() {
        assert!(classify_change(Some("0.1.8"), "0.11.7").shows_release_notes());
        assert!(classify_change(Some("0.2.0"), "0.10.0").shows_release_notes());
    }

    #[test]
    fn downgrade_does_not_claim_an_update() {
        let change = classify_change(Some("0.11.7"), "0.11.6");
        assert_eq!(change, VersionChange::Other);
        assert!(!change.shows_release_notes());
    }

    #[test]
    fn unparseable_versions_do_not_claim_an_update() {
        assert_eq!(
            classify_change(Some("not-a-version"), "0.11.7"),
            VersionChange::Other
        );
        assert_eq!(classify_change(Some("0.11.6"), "dev"), VersionChange::Other);
    }

    /// A prerelease sorts below the release it precedes, so 0.11.7-rc.1 -> 0.11.7 is an upgrade
    /// and the reverse is not.
    #[test]
    fn prerelease_sorts_below_its_release() {
        assert!(classify_change(Some("0.11.7-rc.1"), "0.11.7").shows_release_notes());
        assert!(!classify_change(Some("0.11.7"), "0.11.7-rc.1").shows_release_notes());
    }

    /// `APP_VERSION` is what the running server reports; a build whose version does not parse
    /// would silently disable the release-notes path for everyone.
    #[test]
    fn app_version_is_semver() {
        assert!(
            Version::parse(APP_VERSION).is_ok(),
            "APP_VERSION {APP_VERSION} is not semver"
        );
    }
}
