import { describe, it, expect } from "vitest";
import { markIntentionalStop, consumeIntentionalStop } from "./serverStopIntent.ts";

describe("serverStopIntent", () => {
  it("consumes a marked stop exactly once", () => {
    markIntentionalStop("/wt/a");
    expect(consumeIntentionalStop("/wt/a")).toBe(true);
    // Already consumed → no longer suppressed.
    expect(consumeIntentionalStop("/wt/a")).toBe(false);
  });

  it("returns false for a cwd that was never marked", () => {
    expect(consumeIntentionalStop("/wt/never")).toBe(false);
  });

  it("tracks cwds independently", () => {
    markIntentionalStop("/wt/one");
    expect(consumeIntentionalStop("/wt/two")).toBe(false);
    expect(consumeIntentionalStop("/wt/one")).toBe(true);
  });
});
