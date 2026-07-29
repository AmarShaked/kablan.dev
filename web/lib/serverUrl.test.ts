import { describe, it, expect } from "vitest";
import { findServerUrl } from "./serverUrl.ts";
import type { LogLine } from "../api.ts";

function line(text: string): LogLine {
  return { ts: 0, stream: "stdout", text };
}

describe("findServerUrl", () => {
  it("finds a plain localhost URL", () => {
    expect(findServerUrl([line("Server listening on http://localhost:5173")])).toBe(
      "http://localhost:5173",
    );
  });

  it("finds a 127.0.0.1 URL", () => {
    expect(findServerUrl([line("ready at http://127.0.0.1:3000/")])).toBe("http://127.0.0.1:3000/");
  });

  it("normalizes 0.0.0.0 to localhost", () => {
    expect(findServerUrl([line("Listening on http://0.0.0.0:8080")])).toBe("http://localhost:8080");
  });

  it("returns null when no URL is present", () => {
    expect(findServerUrl([line("compiling..."), line("done in 200ms")])).toBeNull();
  });

  it("returns null for an empty log list", () => {
    expect(findServerUrl([])).toBeNull();
  });
});
