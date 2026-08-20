import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Open the Select whose trigger carries `label` (its aria-label or associated <label>) and return
 * its listbox. The app's dropdowns are Radix Selects, so options only exist while open — a test
 * that asserts on the option list has to open it first. */
export async function openSelect(label: string | RegExp) {
  await userEvent.click(screen.getByLabelText(label));
  return screen.getByRole("listbox");
}

/** Pick `option` (by visible text) from the Select whose trigger carries `label`. */
export async function selectOption(label: string | RegExp, option: string | RegExp) {
  const listbox = await openSelect(label);
  await userEvent.click(within(listbox).getByRole("option", { name: option }));
}

/** The label currently shown on a Select's trigger — the Radix equivalent of a native select's
 * `toHaveValue`. */
export function selectValue(label: string | RegExp): string {
  return screen.getByLabelText(label).textContent?.trim() ?? "";
}
