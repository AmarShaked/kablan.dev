import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TitleBar } from "./TitleBar.tsx";

describe("TitleBar", () => {
  it("renders as a draggable region (Tauri v2's data-tauri-drag-region)", () => {
    render(<TitleBar isTauri={false} projectLabel={null} onOpenSearch={vi.fn()} />);
    expect(screen.getByTestId("titlebar")).toHaveAttribute("data-tauri-drag-region");
  });

  it("reserves ~72px on the left for the traffic lights only inside Tauri", () => {
    const { rerender } = render(<TitleBar isTauri={true} projectLabel={null} onOpenSearch={vi.fn()} />);
    expect(screen.getByTestId("titlebar-lights-spacer")).toHaveClass("w-[72px]");

    rerender(<TitleBar isTauri={false} projectLabel={null} onOpenSearch={vi.fn()} />);
    expect(screen.getByTestId("titlebar-lights-spacer")).toHaveClass("w-0");
  });

  it("reserves a matching ~72px spacer on the right to keep the search centered, regardless of Tauri", () => {
    render(<TitleBar isTauri={false} projectLabel={null} onOpenSearch={vi.fn()} />);
    expect(screen.getByTestId("titlebar-right-spacer")).toHaveClass("w-[72px]");
  });

  it("defaults the search button label to 'projects' when no project is selected", () => {
    render(<TitleBar isTauri={false} projectLabel={null} onOpenSearch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /search projects… ⌘k/i })).toBeInTheDocument();
  });

  it("shows the selected project's name in the search button label", () => {
    render(<TitleBar isTauri={false} projectLabel="kablan-dev" onOpenSearch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /search kablan-dev… ⌘k/i })).toBeInTheDocument();
  });

  it("calls onOpenSearch when the search button is clicked", async () => {
    const onOpenSearch = vi.fn();
    render(<TitleBar isTauri={false} projectLabel={null} onOpenSearch={onOpenSearch} />);
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onOpenSearch).toHaveBeenCalled();
  });

  it("does not put the drag-region attribute on the interactive search button itself", () => {
    render(<TitleBar isTauri={false} projectLabel={null} onOpenSearch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /search/i })).not.toHaveAttribute("data-tauri-drag-region");
  });
});
