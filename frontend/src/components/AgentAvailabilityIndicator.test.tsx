import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { BaseCodingAgent } from 'shared/types';
import settings from '@/i18n/locales/en/settings.json';
import { AgentAvailabilityIndicator } from './AgentAvailabilityIndicator';

/**
 * These assert the real `en` strings rather than keys. The strings are the change — the component
 * was already capable of rendering a state it had no words for — so a test that passes against a
 * mocked `t` would prove nothing that matters here.
 */
beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { settings } },
    interpolation: { escapeValue: false },
  });
});

const renderIndicator = (
  props: Partial<React.ComponentProps<typeof AgentAvailabilityIndicator>> = {}
) =>
  render(
    <I18nextProvider i18n={i18n}>
      <AgentAvailabilityIndicator
        availability={{ status: 'not_found' }}
        agent={BaseCodingAgent.CLAUDE_CODE}
        {...props}
      />
    </I18nextProvider>
  );

describe('AgentAvailabilityIndicator', () => {
  it('renders nothing before a check has run', () => {
    const { container } = renderIndicator({ availability: null });
    expect(container.textContent).toBe('');
  });

  it('names the agent while checking', () => {
    const { container } = renderIndicator({
      availability: { status: 'checking' },
    });
    expect(container.textContent).toContain('Checking Claude Code');
  });

  // The whole point of the ticket: this state used to render an empty div.
  it('tells the user the agent is not ready, and which command fixes it', () => {
    const { container, getByText } = renderIndicator();
    expect(getByText("Claude Code isn't ready")).toBeTruthy();
    expect(container.textContent).toContain('Open a terminal, run');
    expect(container.querySelector('code')?.textContent).toBe('claude');
  });

  // A failed check and no check used to be indistinguishable — both rendered nothing.
  it('distinguishes a failed check from a negative answer', () => {
    const { container } = renderIndicator({
      availability: { status: 'error' },
    });
    expect(container.textContent).toContain("Couldn't check Claude Code");
    expect(container.textContent).toContain('You can continue');
  });

  it.each([[{ status: 'not_found' } as const], [{ status: 'error' } as const]])(
    'offers Recheck on %o so the remedy has a return path',
    (availability) => {
      const onRecheck = vi.fn();
      const { getByRole } = renderIndicator({ availability, onRecheck });
      fireEvent.click(getByRole('button', { name: 'Recheck' }));
      expect(onRecheck).toHaveBeenCalledTimes(1);
    }
  );

  it('offers an install link only on not_found', () => {
    expect(renderIndicator().container.querySelector('a')).toBeTruthy();
    expect(
      renderIndicator({
        availability: { status: 'error' },
      }).container.querySelector('a')
    ).toBeNull();
  });

  // Detection is one check for saved credentials; nothing verifies the agent runs or that the
  // session is live. The status label is where the claim gets made, so that is what's constrained
  // — a detail line saying "Kablan hasn't seen it signed in" is the opposite of overstating.
  it.each([
    [{ status: 'login_detected' } as const],
    [{ status: 'installation_found' } as const],
    [{ status: 'not_found' } as const],
    [{ status: 'error' } as const],
  ])('never claims the user is signed in (%o)', (availability) => {
    const { container } = renderIndicator({ availability });
    const label = container.querySelector('span')?.textContent ?? '';
    expect(label).not.toMatch(/signed in/i);
    expect(label).not.toMatch(/logged in/i);
  });

  // `/login` is a slash command for a program the user is not looking at.
  it.each([
    [{ status: 'login_detected' } as const],
    [{ status: 'installation_found' } as const],
    [{ status: 'not_found' } as const],
    [{ status: 'error' } as const],
  ])('never renders /login (%o)', (availability) => {
    const { container } = renderIndicator({ availability });
    expect(container.textContent).not.toContain('/login');
  });

  // Naming the wrong command is worse than naming none: the user types it.
  it('falls back to command-free copy for an unknown agent', () => {
    const { container } = renderIndicator({ agent: 'SOME_NEW_AGENT' });
    expect(container.querySelector('code')).toBeNull();
    expect(container.textContent).toContain('Some New Agent');
  });
});
