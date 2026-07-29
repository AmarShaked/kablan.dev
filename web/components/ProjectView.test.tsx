import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectView } from "./ProjectView.tsx";
import type { Feature, ProjectSummary } from "../api.ts";

vi.mock("../api.ts");

// The Features roster needs the desktop app's factory backend (useFactory is isTauri-gated);
// force isTauri so this test exercises it like the desktop app does.
vi.mock("../lib/version.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/version.ts")>();
  return { ...actual, isTauri: true };
});

const features: Feature[] = [
  { id: "f1", name: "Feature One", branches: ["feat/one", "feat/two"] },
  { id: "f2", name: "Feature Two", branches: [] },
];

vi.mock("../queries.ts", () => ({
  useFactory: () => ({ data: { features, branchState: {} }, isPending: false }),
}));

const project: ProjectSummary = {
  name: "proj",
  path: "/proj",
  currentBranch: "main",
  detectedCommand: null,
  devCommand: "",
  hasEnv: false,
  packageManager: "npm",
  lastCommitTs: null,
};

function renderView() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ProjectView project={project} />
    </QueryClientProvider>,
  );
}

describe("ProjectView", () => {
  it("shows the project name and path in the breadcrumb", () => {
    renderView();
    expect(screen.getByText("proj")).toBeInTheDocument();
    expect(screen.getByText("/proj")).toBeInTheDocument();
  });

  it("lists every feature with its branch count", () => {
    renderView();
    expect(screen.getByText("Feature One")).toBeInTheDocument();
    expect(screen.getByText("2 branches")).toBeInTheDocument();
    expect(screen.getByText("Feature Two")).toBeInTheDocument();
    expect(screen.getByText("0 branches")).toBeInTheDocument();
  });

  it("opens the create-feature dialog when New feature is clicked", async () => {
    renderView();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new feature/i }));
    expect(screen.getByRole("dialog", { name: /new feature/i })).toBeInTheDocument();
  });
});
