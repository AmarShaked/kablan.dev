import { describe, expect, it } from 'vitest';

import { CONTEXT_WARN_THRESHOLD, contextIsHeavy } from './ContextMeter';

/**
 * The threshold is a measurement, not a preference: Claude Code's own usage breakdown attributes
 * the bulk of consumption to work above 150k context, and a task measured at 42k cost a fraction
 * of what the same work cost on one that had grown past it. If someone changes this number, that
 * is a claim about the data and should be a deliberate edit, not a drift.
 */
describe('contextIsHeavy', () => {
  it('uses the measured 150k threshold', () => {
    expect(CONTEXT_WARN_THRESHOLD).toBe(150_000);
  });

  it('is quiet below it', () => {
    // The fresh task we measured: 25 tool calls, ~42k context, one percent of the window.
    expect(
      contextIsHeavy({ total_tokens: 42_000, model_context_window: 200_000 })
    ).toBe(false);
    expect(
      contextIsHeavy({ total_tokens: 149_999, model_context_window: 200_000 })
    ).toBe(false);
  });

  it('warns at and above it', () => {
    expect(
      contextIsHeavy({ total_tokens: 150_000, model_context_window: 200_000 })
    ).toBe(true);
    expect(
      contextIsHeavy({ total_tokens: 787_000, model_context_window: 1_000_000 })
    ).toBe(true);
  });

  it('says nothing before the agent has reported', () => {
    // No report yet is not the same as a small context — it must not render a reassuring zero.
    expect(contextIsHeavy(null)).toBe(false);
  });

  it('judges the absolute size, not the fraction of the window', () => {
    // 160k in a 1M window is only 16% full but still expensive per turn, because every tool
    // call re-sends all of it. The window is context for the reader, not the trigger.
    expect(
      contextIsHeavy({ total_tokens: 160_000, model_context_window: 1_000_000 })
    ).toBe(true);
  });
});
