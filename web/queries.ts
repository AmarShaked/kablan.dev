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

export function useDiff(name: string, sha?: string, cwd?: string, enabled = true) {
  return useQuery({
    queryKey: ["diff", name, cwd ?? "", sha ?? "working"] as const,
    queryFn: () => api.getDiff(name, { sha, cwd }),
    enabled: enabled && !!name,
    staleTime: 15_000,
  });
}

export function useGitlabOverview(name: string) {
  return useQuery({
    queryKey: ["gitlab-overview", name] as const,
    queryFn: () => api.gitlab.overview(name),
    enabled: isTauri && !!name,
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
