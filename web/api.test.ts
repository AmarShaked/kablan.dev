import { describe, it, expectTypeOf } from "vitest";
import type { AppConfig, FactorySettings, FactoryOverview, TaskForce, AgentView, AgentStatus } from "./api.ts";

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
