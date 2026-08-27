/**
 * Kablan fork: product analytics are removed.
 *
 * Upstream calls PostHog from ~9 places. Rather than edit each one (and risk a future import
 * quietly re-enabling tracking), `posthog-js` and `posthog-js/react` are aliased to this no-op in
 * vite.config.ts. Every capture/identify/survey call becomes a local no-op — nothing is sent.
 */
const noop = () => {};

export const posthog = {
  init: noop,
  capture: noop,
  identify: noop,
  displaySurvey: noop,
  opt_in_capturing: noop,
  opt_out_capturing: noop,
  reset: noop,
};

/** Mirrors `posthog-js/react`'s hook so components can keep calling it unchanged. */
export const usePostHog = () => posthog;

/** Mirrors the provider so any remaining JSX usage still renders its children. */
export const PostHogProvider = ({ children }: { children?: unknown }) => children as never;

export default posthog;
