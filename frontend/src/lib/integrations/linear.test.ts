import { describe, expect, it } from 'vitest';
import { getNextLinearPageParam } from './linear';

describe('getNextLinearPageParam', () => {
  it('returns the cursor when another page exists', () => {
    expect(
      getNextLinearPageParam({
        page_info: { has_next_page: true, end_cursor: 'cursor-2' },
      })
    ).toBe('cursor-2');
  });

  it('returns undefined when exhausted', () => {
    expect(
      getNextLinearPageParam({
        page_info: { has_next_page: false, end_cursor: 'cursor-2' },
      })
    ).toBeUndefined();
    expect(
      getNextLinearPageParam({
        page_info: { has_next_page: true, end_cursor: null },
      })
    ).toBeUndefined();
  });
});
