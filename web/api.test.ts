import { describe, it, expectTypeOf } from "vitest";
import type { AppConfig, FactorySettings } from "./api.ts";

describe("AppConfig factory types", () => {
  it("exposes factory settings", () => {
    expectTypeOf<AppConfig["factory"]>().toEqualTypeOf<FactorySettings>();
    expectTypeOf<FactorySettings["maxConcurrentAgents"]>().toBeNumber();
    expectTypeOf<FactorySettings["stopAgentsOnExit"]>().toBeBoolean();
  });
});
