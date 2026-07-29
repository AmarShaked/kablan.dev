import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FeatureIconButton, featureIconKey } from "./FeatureIconButton.tsx";
import { useProjectIcons } from "../lib/projectIcons.tsx";

describe("FeatureIconButton", () => {
  it("renders the default folder icon when unset", () => {
    render(<FeatureIconButton featureId="f-default" />);
    expect(screen.getByTitle("Change icon")).toBeInTheDocument();
  });

  it("clicking the trigger opens the icon grid without toggling anything else", async () => {
    const onExpandToggle = vi.fn();
    render(
      <div onClick={onExpandToggle}>
        <FeatureIconButton featureId="f-open" />
      </div>,
    );
    await userEvent.click(screen.getByTitle("Change icon"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onExpandToggle).not.toHaveBeenCalled();
  });

  it("picking an icon persists it in the shared icon store and closes the popover", async () => {
    function Probe() {
      const icons = useProjectIcons();
      return <span data-testid="probe">{icons[featureIconKey("f-pick")] ?? "unset"}</span>;
    }
    render(
      <>
        <FeatureIconButton featureId="f-pick" />
        <Probe />
      </>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("unset");

    await userEvent.click(screen.getByTitle("Change icon"));
    await userEvent.click(screen.getByTitle("rocket"));

    expect(screen.getByTestId("probe").textContent).toBe("rocket");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("picking an icon does not fire an expand toggle on an ancestor click handler", async () => {
    const onExpandToggle = vi.fn();
    render(
      <div onClick={onExpandToggle}>
        <FeatureIconButton featureId="f-pick-no-expand" />
      </div>,
    );
    await userEvent.click(screen.getByTitle("Change icon"));
    await userEvent.click(screen.getByTitle("star"));
    expect(onExpandToggle).not.toHaveBeenCalled();
  });
});
