import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CONTEXT_WARN_THRESHOLD,
  ContextMeter,
  contextIsHeavy,
} from './ContextMeter';

/**
 * What the thing actually puts on screen, because the whole feature exists to be read at a
 * glance before pressing send — a correct number rendered as nothing would be the same bug as
 * not having it. The threshold it draws on is covered below.
 */
describe('ContextMeter', () => {
  it('shows the count against the window', () => {
    render(
      <ContextMeter
        info={{ total_tokens: 42_000, model_context_window: 200_000 }}
      />
    );
    expect(screen.getByText(/42k/)).toBeInTheDocument();
    expect(screen.getByText(/200k/)).toBeInTheDocument();
    expect(screen.getByText('Context')).toBeInTheDocument();
  });

  it('warns once the context is heavy', () => {
    const { container } = render(
      <ContextMeter
        info={{ total_tokens: 152_300, model_context_window: 200_000 }}
      />
    );
    // The warning colour is the signal; the tooltip carries the reason.
    expect(container.querySelector('.text-warning')).not.toBeNull();
    expect(container.textContent).toContain('152k');
    expect(container.firstElementChild?.getAttribute('title')).toContain(
      'every further turn pays for all of it'
    );
  });

  it('stays quiet below the threshold', () => {
    const { container } = render(
      <ContextMeter
        info={{ total_tokens: 42_000, model_context_window: 200_000 }}
      />
    );
    expect(container.querySelector('.text-warning')).toBeNull();
  });

  it('renders nothing before the agent has reported', () => {
    // Not a zero — a zero would read as "this task is cheap", which is a claim we cannot make.
    const { container } = render(<ContextMeter info={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the window is unknown', () => {
    // Without a window there is no fraction to draw, and a bare number would imply one.
    const { container } = render(
      <ContextMeter info={{ total_tokens: 42_000, model_context_window: 0 }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('drops the label and the bar in the compact row form', () => {
    const { container } = render(
      <ContextMeter
        info={{ total_tokens: 42_000, model_context_window: 200_000 }}
        variant="row"
      />
    );
    expect(screen.queryByText('Context')).toBeNull();
    expect(container.textContent).toContain('42k');
  });
});

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
