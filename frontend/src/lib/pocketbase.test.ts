import { describe, expect, it } from 'vitest';
import {
  displayNameFromUser,
  dmKeyFor,
  firstNameFromUser,
  isPocketBaseConfigured,
  normalizeEmail,
  POCKETBASE_URL,
} from './pocketbase';

describe('pocketbase config', () => {
  it('is optional when VITE_POCKETBASE_URL is unset', () => {
    // Vitest env does not set VITE_POCKETBASE_URL by default.
    expect(POCKETBASE_URL).toBe('');
    expect(isPocketBaseConfigured()).toBe(false);
  });
});

describe('display names', () => {
  it('uses full name when set', () => {
    expect(displayNameFromUser({ name: 'Shaked Amar', email: 'a@b.com' })).toBe(
      'Shaked Amar'
    );
  });

  it('falls back to email local-part', () => {
    expect(displayNameFromUser({ email: 'shakeda@sweet.security' })).toBe(
      'shakeda'
    );
  });

  it('first name is the first word', () => {
    expect(firstNameFromUser({ name: 'Shaked Amar' })).toBe('Shaked');
  });
});

describe('dm helpers', () => {
  it('builds a stable key regardless of argument order', () => {
    expect(dmKeyFor('aaa', 'zzz')).toBe('aaa_zzz');
    expect(dmKeyFor('zzz', 'aaa')).toBe('aaa_zzz');
  });

  it('normalizes email for lookup', () => {
    expect(normalizeEmail('  Alex@Example.COM ')).toBe('alex@example.com');
  });
});
