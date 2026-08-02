import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InboxView } from "./InboxView.tsx";
import type { InboxEntry } from "../api.ts";

const entries: InboxEntry[] = [
  {
    project: "proj-a",
    featureId: "f1",
    featureName: "Feature One",
    branch: "feat/one",
    status: "awaitingInput",
  },
  {
    project: "proj-b",
    branch: "feat/two",
    status: "failed",
  },
];

const useInboxMock = vi.fn();
vi.mock("../queries.ts", () => ({
  useInbox: () => useInboxMock(),
}));

function renderView(onOpen = vi.fn()) {
  render(<InboxView onOpen={onOpen} />);
  return onOpen;
}

/** A row is "read" when its wrapper carries data-read="true" (dimmed styling). */
function rowFor(branch: string): HTMLElement | null {
  const span = screen.queryByText(branch);
  return span?.closest("[data-read]") as HTMLElement | null;
}

beforeEach(() => {
  localStorage.clear();
});

describe("InboxView", () => {
  it("renders a row per entry with its project, feature (when filed), and branch", () => {
    useInboxMock.mockReturnValue({ data: entries, isPending: false });
    renderView();

    expect(screen.getByText(/proj-a/)).toBeInTheDocument();
    expect(screen.getByText(/Feature One/)).toBeInTheDocument();
    expect(screen.getByText("feat/one")).toBeInTheDocument();

    expect(screen.getByText(/proj-b/)).toBeInTheDocument();
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

  it("marks an item read (dimmed) and calls onOpen when clicked", async () => {
    // Unique keys so the module-level read overlay starts unread for this row.
    const row: InboxEntry = { project: "click-p", branch: "click/branch", status: "awaitingInput" };
    useInboxMock.mockReturnValue({ data: [row], isPending: false });
    const onOpen = renderView();

    expect(rowFor("click/branch")?.getAttribute("data-read")).toBe("false");

    await userEvent.click(screen.getByRole("button", { name: /open/i }));

    expect(onOpen).toHaveBeenCalledWith(row);
    expect(rowFor("click/branch")?.getAttribute("data-read")).toBe("true");
  });

  it("Mark all read dims every row and disables itself (0 unread)", async () => {
    const rows: InboxEntry[] = [
      { project: "clear-p", branch: "clear/one", status: "awaitingInput" },
      { project: "clear-p", branch: "clear/two", status: "failed" },
    ];
    useInboxMock.mockReturnValue({ data: rows, isPending: false });
    renderView();

    const clearBtn = screen.getByRole("button", { name: /mark all read/i });
    expect(clearBtn).toBeEnabled();

    await userEvent.click(clearBtn);

    expect(rowFor("clear/one")?.getAttribute("data-read")).toBe("true");
    expect(rowFor("clear/two")?.getAttribute("data-read")).toBe("true");
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeDisabled();
  });

  it("hides Mark all read when the inbox is empty", () => {
    useInboxMock.mockReturnValue({ data: [], isPending: false });
    renderView();

    expect(screen.queryByRole("button", { name: /mark all read/i })).not.toBeInTheDocument();
  });
});
