import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

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
