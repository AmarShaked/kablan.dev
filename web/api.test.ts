import { describe, it, expectTypeOf } from "vitest";
import type { AppConfig, FactorySettings, FactoryOverview, Feature, BranchState, AgentView, AgentStatus, InboxEntry } from "./api.ts";
import { api } from "./api.ts";

describe("AppConfig factory types", () => {
  it("exposes factory settings", () => {
    expectTypeOf<AppConfig["factory"]>().toEqualTypeOf<FactorySettings>();
    expectTypeOf<FactorySettings["maxConcurrentAgents"]>().toBeNumber();
    expectTypeOf<FactorySettings["stopAgentsOnExit"]>().toBeBoolean();
  });
});

describe("factory types", () => {
  it("Feature is a folder of branch names", () => {
    expectTypeOf<Feature["branches"]>().toEqualTypeOf<string[]>();
    expectTypeOf<AgentView["status"]>().toEqualTypeOf<AgentStatus>();
  });

  it("FactoryOverview pairs features with a branch-keyed state map", () => {
    expectTypeOf<FactoryOverview["features"]>().toEqualTypeOf<Feature[]>();
    expectTypeOf<FactoryOverview["branchState"]>().toEqualTypeOf<Record<string, BranchState>>();
    expectTypeOf<BranchState["worktreePath"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<BranchState["agentSessionId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<BranchState["createdAt"]>().toBeNumber();
  });

  it("api.factory exposes branch-keyed calls (branch never a path segment)", () => {
    expectTypeOf<typeof api.factory.agentStart>().parameters.toEqualTypeOf<
      [string, string, { copyNodeModules?: boolean; copyEnv?: boolean; model?: string }?]
    >();
    expectTypeOf<typeof api.factory.agentMessage>().parameters.toEqualTypeOf<[string, string, string]>();
    expectTypeOf<typeof api.factory.agentStop>().parameters.toEqualTypeOf<[string, string]>();
    expectTypeOf<typeof api.factory.getAgent>().parameters.toEqualTypeOf<[string, string]>();
  });

  it("api.factory.startSession takes a project + base branch + options (message + copy flags), returning the new branch", () => {
    expectTypeOf<typeof api.factory.startSession>().parameters.toEqualTypeOf<
      [string, string, { message?: string; copyNodeModules?: boolean; copyEnv?: boolean }?]
    >();
    expectTypeOf<ReturnType<typeof api.factory.startSession>>().toEqualTypeOf<Promise<{ branch: string }>>();
  });
});

describe("inbox types", () => {
  it("InboxEntry is branch-keyed, with an optional feature", () => {
    expectTypeOf<InboxEntry["project"]>().toBeString();
    expectTypeOf<InboxEntry["branch"]>().toBeString();
    expectTypeOf<InboxEntry["featureId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<InboxEntry["featureName"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<InboxEntry["status"]>().toBeString();
  });

  it("api.inbox returns Promise<InboxEntry[]>", () => {
    expectTypeOf<ReturnType<typeof api.inbox>>().toEqualTypeOf<Promise<InboxEntry[]>>();
  });
});
