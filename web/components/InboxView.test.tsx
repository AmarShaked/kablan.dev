import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SidebarProvider } from "./ui/sidebar.tsx";
import { InboxView } from "./InboxView.tsx";
import type { InboxEntry } from "../api.ts";

const entries: InboxEntry[] = [
  {
    project: "proj-a",
    featureId: "f1",
    featureName: "Feature One",
    taskForceId: "t1",
    taskForceName: "TF One",
    branch: "feat/one",
    status: "awaitingInput",
  },
  {
    project: "proj-b",
    featureId: "f2",
    featureName: "Feature Two",
    taskForceId: "t2",
    taskForceName: "TF Two",
    branch: "feat/two",
    status: "failed",
  },
];

const useInboxMock = vi.fn();
vi.mock("../queries.ts", () => ({
  useInbox: () => useInboxMock(),
}));

function renderView(onOpen = vi.fn()) {
  render(
    <SidebarProvider>
      <InboxView onOpen={onOpen} />
    </SidebarProvider>,
  );
  return onOpen;
}

describe("InboxView", () => {
  it("renders a row per entry with its path and branch", () => {
    useInboxMock.mockReturnValue({ data: entries, isPending: false });
    renderView();

    expect(screen.getByText(/proj-a/)).toBeInTheDocument();
    expect(screen.getByText(/Feature One/)).toBeInTheDocument();
    expect(screen.getByText(/TF One/)).toBeInTheDocument();
    expect(screen.getByText("feat/one")).toBeInTheDocument();

    expect(screen.getByText(/proj-b/)).toBeInTheDocument();
    expect(screen.getByText(/Feature Two/)).toBeInTheDocument();
    expect(screen.getByText(/TF Two/)).toBeInTheDocument();
    expect(screen.getByText("feat/two")).toBeInTheDocument();
  });

  it("renders a status chip/dot for each entry reflecting awaitingInput vs failed", () => {
    useInboxMock.mockReturnValue({ data: entries, isPending: false });
    renderView();

    const dots = document.querySelectorAll("[title='awaitingInput'], [title='failed']");
    expect(dots).toHaveLength(2);
    expect(document.querySelector("[title='awaitingInput']")).toBeInTheDocument();
    expect(document.querySelector("[title='failed']")).toBeInTheDocument();
  });

  it("calls onOpen with the entry when its Open button is clicked", async () => {
    useInboxMock.mockReturnValue({ data: entries, isPending: false });
    const onOpen = renderView();

    const openButtons = screen.getAllByRole("button", { name: /open/i });
    expect(openButtons).toHaveLength(2);
    await userEvent.click(openButtons[0]);

    expect(onOpen).toHaveBeenCalledWith(entries[0]);
  });

  it("shows an empty state when there are no entries", () => {
    useInboxMock.mockReturnValue({ data: [], isPending: false });
    renderView();

    expect(screen.getByText(/nothing needs you right now/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open/i })).not.toBeInTheDocument();
  });

  it("shows a loading state while the query is pending", () => {
    useInboxMock.mockReturnValue({ data: undefined, isPending: true });
    renderView();

    expect(screen.queryByRole("button", { name: /open/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing needs you right now/i)).not.toBeInTheDocument();
  });
});
