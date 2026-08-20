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

// react-resizable-panels (the cockpit's resizable split) constructs a ResizeObserver — jsdom lacks
// it, which would throw on render. A no-op observer is enough for the panels to render their
// children. (Interacting with a control inside a panel additionally needs userEvent's
// pointer-events check disabled — see the cockpit tests — because the panel's styles confuse that
// check in jsdom.)
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Radix Select (the app's dropdown, replacing native <select>s) drives its trigger with the Pointer
// Capture API and scrolls the highlighted item into view — jsdom implements neither, which would
// throw the moment a test opens a dropdown. No-ops are enough: the tests assert the resulting DOM,
// not scroll position.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
