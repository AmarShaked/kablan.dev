import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("renders a component", () => {
    render(<button>hello</button>);
    expect(screen.getByRole("button", { name: "hello" })).toBeInTheDocument();
  });
});
