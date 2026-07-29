import { describe, it, expect } from "vitest";
import {
  reorderIds,
  dropSide,
  setBranchDragData,
  getBranchDragData,
  setFeatureDragData,
  getFeatureDragData,
} from "./dnd.ts";

/** Minimal stand-in for the DOM `DataTransfer` used by native HTML5 drag-and-drop — a plain
 * object backed by a Map, matching what `fireEvent.dragStart/dragOver/drop` accept as
 * `dataTransfer` in jsdom (which has no real drag-and-drop implementation of its own). */
function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
    },
    getData: (format: string) => store.get(format) ?? "",
  } as unknown as DataTransfer;
}

describe("reorderIds", () => {
  it("moves an id to the given drop index, shifting the rest", () => {
    expect(reorderIds(["a", "b", "c"], "a", 2)).toEqual(["b", "a", "c"]);
  });

  it("moving to index 0 puts the id first", () => {
    expect(reorderIds(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("moving to the list's length appends the id at the end", () => {
    expect(reorderIds(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
  });

  it("dropping on its own current slot is a no-op", () => {
    expect(reorderIds(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
  });

  it("returns the list unchanged when the id isn't a member", () => {
    const ids = ["a", "b", "c"];
    expect(reorderIds(ids, "nope", 1)).toEqual(ids);
  });

  it("clamps an out-of-range drop index", () => {
    expect(reorderIds(["a", "b", "c"], "a", 999)).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b", "c"], "a", -5)).toEqual(["a", "b", "c"]);
  });
});

describe("dropSide", () => {
  it("is 'before' when the pointer is in the top half of the rect", () => {
    expect(dropSide({ top: 100, height: 20 }, 105)).toBe("before");
  });

  it("is 'after' when the pointer is in the bottom half of the rect", () => {
    expect(dropSide({ top: 100, height: 20 }, 115)).toBe("after");
  });

  it("treats the exact midpoint as 'after'", () => {
    expect(dropSide({ top: 100, height: 20 }, 110)).toBe("after");
  });
});

describe("branch drag data", () => {
  it("round-trips a branch payload through setData/getData", () => {
    const dt = fakeDataTransfer();
    setBranchDragData(dt, { branch: "feat/a", sourceFeatureId: "f1" });
    expect(getBranchDragData(dt)).toEqual({ kind: "branch", branch: "feat/a", sourceFeatureId: "f1" });
  });

  it("round-trips an unfiled branch (no sourceFeatureId)", () => {
    const dt = fakeDataTransfer();
    setBranchDragData(dt, { branch: "main" });
    expect(getBranchDragData(dt)).toEqual({ kind: "branch", branch: "main" });
  });

  it("returns null when nothing was set", () => {
    expect(getBranchDragData(fakeDataTransfer())).toBeNull();
  });

  it("returns null for malformed data instead of throwing", () => {
    const dt = fakeDataTransfer();
    dt.setData("application/x-kablan-branch", "{not json");
    expect(getBranchDragData(dt)).toBeNull();
  });
});

describe("feature drag data", () => {
  it("round-trips a feature payload through setData/getData", () => {
    const dt = fakeDataTransfer();
    setFeatureDragData(dt, "f1");
    expect(getFeatureDragData(dt)).toEqual({ kind: "feature", featureId: "f1" });
  });

  it("returns null when nothing was set", () => {
    expect(getFeatureDragData(fakeDataTransfer())).toBeNull();
  });

  it("a branch payload isn't mistaken for a feature payload (different MIME types)", () => {
    const dt = fakeDataTransfer();
    setBranchDragData(dt, { branch: "feat/a" });
    expect(getFeatureDragData(dt)).toBeNull();
  });
});
