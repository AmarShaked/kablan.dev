import "@testing-library/jest-dom/vitest";

// Several components (anything using SidebarTrigger) render inside a SidebarProvider, whose
// mobile-detection effect needs matchMedia — jsdom doesn't implement it. Stubbed once here so
// individual test files don't each re-stub it.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
