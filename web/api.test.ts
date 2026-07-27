import { describe, it, expectTypeOf } from "vitest";
import type { AppConfig, FactorySettings, FactoryOverview, TaskForce, AgentView, AgentStatus, InboxEntry } from "./api.ts";
import { api } from "./api.ts";

describe("AppConfig factory types", () => {
  it("exposes factory settings", () => {
    expectTypeOf<AppConfig["factory"]>().toEqualTypeOf<FactorySettings>();
    expectTypeOf<FactorySettings["maxConcurrentAgents"]>().toBeNumber();
    expectTypeOf<FactorySettings["stopAgentsOnExit"]>().toBeBoolean();
  });
});

describe("factory types", () => {
  it("factory types", () => {
    expectTypeOf<FactoryOverview["features"][number]["taskForces"]>().toEqualTypeOf<TaskForce[]>();
    expectTypeOf<AgentView["status"]>().toEqualTypeOf<AgentStatus>();
    expectTypeOf<TaskForce["agentSessionId"]>().toEqualTypeOf<string | undefined>();
  });
});

describe("inbox types", () => {
  it("InboxEntry has correct shape", () => {
    expectTypeOf<InboxEntry["project"]>().toBeString();
    expectTypeOf<InboxEntry["featureId"]>().toBeString();
    expectTypeOf<InboxEntry["featureName"]>().toBeString();
    expectTypeOf<InboxEntry["taskForceId"]>().toBeString();
    expectTypeOf<InboxEntry["taskForceName"]>().toBeString();
    expectTypeOf<InboxEntry["branch"]>().toBeString();
    expectTypeOf<InboxEntry["status"]>().toBeString();
  });

  it("api.inbox returns Promise<InboxEntry[]>", () => {
    expectTypeOf<ReturnType<typeof api.inbox>>().toEqualTypeOf<Promise<InboxEntry[]>>();
  });
});
