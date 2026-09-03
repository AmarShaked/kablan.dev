import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContextMeter } from './ContextMeter';

/**
 * What the thing actually puts on screen. The logic lives in `contextMeter.test.ts`; this covers
 * the part a user sees, because the whole feature exists to be read at a glance before pressing
 * send — a correct number rendered as nothing would be the same bug as not having it.
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
