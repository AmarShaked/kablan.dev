import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { relativeDay } from './relativeDay';

describe('relativeDay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 6, 18, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const thisAfternoon = new Date(2026, 8, 6, 16, 24, 0);

  it('formats today in 12-hour time', () => {
    expect(relativeDay(thisAfternoon, true, 'en-US')).toBe('4:24 PM');
  });

  it('formats today in 24-hour time', () => {
    expect(relativeDay(thisAfternoon, false, 'en-US')).toBe('16:24');
  });

  it('uses a weekday within the last week', () => {
    expect(relativeDay(new Date(2026, 8, 4, 9, 0, 0), true, 'en-US')).toBe(
      'Fri'
    );
  });

  it('uses a month and day beyond a week', () => {
    expect(relativeDay(new Date(2026, 7, 1, 9, 0, 0), true, 'en-US')).toBe(
      'Aug 1'
    );
  });
});
