import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";
import { isTauri } from "./lib/version.ts";

/** Query keys — exported so mutations can invalidate them. */
export const qk = {
  projects: ["projects"] as const,
  branches: (name: string) => ["branches", name] as const,
  worktrees: (name: string) => ["worktrees", name] as const,
};

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: api.listProjects });
}

export function useBranches(name: string) {
  return useQuery({
    queryKey: qk.branches(name),
    queryFn: () => api.getBranches(name),
    enabled: !!name,
  });
}

export function useWorktrees(name: string) {
  return useQuery({
    queryKey: qk.worktrees(name),
    queryFn: () => api.getWorktrees(name),
    enabled: !!name,
  });
}

export function useCommits(name: string, ref?: string, cwd?: string, enabled = true) {
  return useQuery({
    queryKey: ["commits", name, cwd ?? "", ref ?? ""] as const,
    queryFn: () => api.getCommits(name, { ref, cwd }),
    enabled: enabled && !!name,
    staleTime: 60_000,
  });
}

export function useLog(name: string, ref?: string, cwd?: string, enabled = true) {
  return useQuery({
    queryKey: ["log", name, cwd ?? "", ref ?? ""] as const,
    queryFn: () => api.getLog(name, { ref, cwd, limit: 100 }),
    enabled: enabled && !!name,
    staleTime: 30_000,
  });
}

export function useDiff(name: string, sha?: string, cwd?: string, enabled = true, against?: string) {
  return useQuery({
    // The compare target (`against`) and `cwd` are part of the key so switching
    // branches/targets refetches rather than showing a stale cached diff.
    queryKey: ["diff", name, cwd ?? "", sha ?? "working", against ?? ""] as const,
    queryFn: () => api.getDiff(name, { sha, cwd, against }),
    enabled: enabled && !!name,
    // The working diff reflects the live working tree, so never serve it stale:
    // refetch on mount and whenever the user returns focus to the app.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** Tracked + untracked file paths for a working copy — feeds the composer's @-file typeahead.
 * Enabled only when a `cwd` is known; the list changes rarely, so it's cached generously. */
export function useFiles(name: string, cwd?: string) {
  return useQuery({
    queryKey: ["files", name, cwd ?? ""] as const,
    queryFn: () => api.getFiles(name, cwd),
    enabled: !!name && !!cwd,
    staleTime: 5 * 60_000,
  });
}

export function useGitlabOverview(name: string, enabled = true) {
  return useQuery({
    queryKey: ["gitlab-overview", name] as const,
    queryFn: () => api.gitlab.overview(name),
    enabled: enabled && isTauri && !!name,
    staleTime: 60_000,
  });
}

export function useFactory(name: string) {
  return useQuery({
    queryKey: ["factory", name] as const,
    queryFn: () => api.factory.list(name),
    enabled: isTauri && !!name,
    staleTime: 30_000,
  });
}

export function useInbox() {
  return useQuery({
    queryKey: ["inbox"] as const,
    queryFn: api.inbox,
    enabled: isTauri,
    refetchInterval: 15_000,
  });
}
