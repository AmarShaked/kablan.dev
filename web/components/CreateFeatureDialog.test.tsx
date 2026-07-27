import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateFeatureDialog } from "./CreateFeatureDialog.tsx";
import { api } from "../api.ts";
import type { Feature } from "../api.ts";

vi.mock("../api.ts");

function renderDialog(overrides: Partial<Parameters<typeof CreateFeatureDialog>[0]> = {}) {
  const qc = new QueryClient();
  const props = {
    project: "proj",
    open: true,
    onOpenChange: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={qc}>
      <CreateFeatureDialog {...props} />
    </QueryClientProvider>,
  );
  return props;
}

describe("CreateFeatureDialog", () => {
  beforeEach(() => {
    vi.mocked(api.factory.createFeature).mockReset();
  });

  it("disables Create when the name is empty", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
  });

  it("creates the feature, notifies, and closes on success", async () => {
    const feature: Feature = { id: "f1", name: "My Feature", taskForces: [] };
    vi.mocked(api.factory.createFeature).mockResolvedValue(feature);
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/name/i), "My Feature");
    expect(screen.getByRole("button", { name: /create/i })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(api.factory.createFeature).toHaveBeenCalledWith("proj", "My Feature");
    await vi.waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(feature));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not call onCreated or close when the API call fails", async () => {
    vi.mocked(api.factory.createFeature).mockRejectedValue(new Error("boom"));
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/name/i), "Broken");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await vi.waitFor(() => expect(api.factory.createFeature).toHaveBeenCalled());
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
