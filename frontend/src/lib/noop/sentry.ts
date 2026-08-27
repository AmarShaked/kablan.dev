/**
 * Kablan fork: crash reporting is removed.
 *
 * Upstream shipped Bloop AI's own Sentry DSN, so an unmodified fork would report this app's
 * errors to them. `@sentry/react` is aliased to this no-op in vite.config.ts; errors stay local
 * (they're still logged to the console).
 */
const noop = () => {};

/** Router instrumentation upstream wraps <Routes> with — here it returns the component as-is. */
export const withSentryReactRouterV6Routing = <T,>(component: T): T => component;

export const init = noop;
export const setTag = noop;
export const setUser = noop;
export const captureException = noop;
export const captureMessage = noop;
export const configureScope = noop;
/** Upstream's boundary rendered a fallback; without reporting there's nothing to add. */
export const ErrorBoundary = ({ children }: { children?: unknown }) => children as never;
