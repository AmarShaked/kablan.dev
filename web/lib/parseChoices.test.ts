import { describe, it, expect } from "vitest";
import { parseChoices } from "./parseChoices.ts";

describe("parseChoices", () => {
  it("parses a numbered list (1. style)", () => {
    const text = "Pick one:\n1. Add tests\n2. Refactor the util\n3. Ship as-is";
    expect(parseChoices(text)).toEqual([
      { label: "Add tests" },
      { label: "Refactor the util" },
      { label: "Ship as-is" },
    ]);
  });

  it("parses a numbered list (1) style)", () => {
    const text = "1) First option\n2) Second option";
    expect(parseChoices(text)).toEqual([{ label: "First option" }, { label: "Second option" }]);
  });

  it("parses a bulleted list (- and *)", () => {
    const text = "Options:\n- Use Redis\n- Use Postgres\n* Use SQLite";
    expect(parseChoices(text)).toEqual([
      { label: "Use Redis" },
      { label: "Use Postgres" },
      { label: "Use SQLite" },
    ]);
  });

  it("returns an empty array for prose with no list", () => {
    const text = "This is just a paragraph of prose with no list markers at all. Nothing to see here.";
    expect(parseChoices(text)).toEqual([]);
  });

  it("returns an empty array for empty text", () => {
    expect(parseChoices("")).toEqual([]);
  });

  it("caps at 6 items even if more are present", () => {
    const text = Array.from({ length: 10 }, (_, i) => `${i + 1}. Option ${i + 1}`).join("\n");
    const result = parseChoices(text);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ label: "Option 1" });
    expect(result[5]).toEqual({ label: "Option 6" });
  });
});
