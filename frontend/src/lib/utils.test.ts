import { describe, expect, it } from 'vitest';

import { cn } from './utils';

/**
 * The merge in `cn` was switched off once because it was thought to mishandle this project's
 * custom classes. These hold that claim to account: every custom colour, size and spacing key
 * from tailwind.new.config.js has to survive a merge, and the conflicts we do want resolved have
 * to actually resolve. If a future config adds a token that collides with a Tailwind group name,
 * one of these fails rather than a colour quietly vanishing from the page.
 */
describe('cn', () => {
  describe("keeps this project's custom classes", () => {
    it('a custom colour and a font size are different things', () => {
      // The exact pair the old comment worried about: brand is a colour, base is a size.
      expect(cn('text-brand', 'text-base')).toBe('text-brand text-base');
      expect(cn('text-brand-hover', 'text-base')).toBe(
        'text-brand-hover text-base'
      );
      expect(cn('text-on-brand', 'text-sm')).toBe('text-on-brand text-sm');
    });

    it('keeps the text colour scale', () => {
      expect(cn('text-high', 'text-lg')).toBe('text-high text-lg');
      expect(cn('text-normal', 'text-xs')).toBe('text-normal text-xs');
      expect(cn('text-low', 'text-xl')).toBe('text-low text-xl');
    });

    it('keeps the custom spacing keys', () => {
      expect(cn('p-base')).toBe('p-base');
      expect(cn('gap-double', 'h-half')).toBe('gap-double h-half');
      expect(cn('m-plusfifty')).toBe('m-plusfifty');
    });

    it('keeps the custom background and border tokens', () => {
      expect(cn('bg-panel')).toBe('bg-panel');
      expect(cn('bg-secondary')).toBe('bg-secondary');
      expect(cn('border-base')).toBe('border-base');
    });

    it('keeps the custom font size', () => {
      expect(cn('text-cta')).toBe('text-cta');
    });
  });

  describe('resolves the conflicts that were going unresolved', () => {
    it("a caller's padding beats the variant's", () => {
      // The shape of the bug: cva puts variant classes first and className last, so the caller
      // is the one that should win. Without the merge both survived and the cascade chose px-3.
      expect(cn('inline-flex px-3 text-xs', 'h-8 w-8 p-0')).toBe(
        'inline-flex text-xs h-8 w-8 p-0'
      );
    });

    it('the last size wins', () => {
      expect(cn('h-10 w-10', 'h-8 w-8')).toBe('h-8 w-8');
    });

    it('a later colour replaces an earlier one', () => {
      expect(cn('text-high', 'text-low')).toBe('text-low');
    });
  });

  it('leaves a variant-prefixed class alone, which is why ! is still needed for those', () => {
    // Different conditions, so not a conflict — `mr-0` cannot override a margin that only
    // applies at md and under a peer selector.
    expect(cn('md:peer-data-[variant=inset]:m-2', 'mr-0')).toBe(
      'md:peer-data-[variant=inset]:m-2 mr-0'
    );
  });

  it('still does what clsx did: conditionals and falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });
});
