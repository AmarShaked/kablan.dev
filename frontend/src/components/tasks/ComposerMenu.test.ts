import { describe, expect, it } from 'vitest';

import { modelLabel } from './ComposerMenu';

/**
 * The Model submenu shows whatever a configuration pins, run through this. The profiles file
 * writes aliases (`opus`) because the agent's CLI documents them as "the latest of that family";
 * a user's own profiles.json often pins full ids instead. Both have to arrive as a name someone
 * would recognise, or the menu reads like a config file.
 */
describe('modelLabel', () => {
  it('names the family aliases the profiles file uses', () => {
    expect(modelLabel('fable')).toBe('Claude Fable');
    expect(modelLabel('opus')).toBe('Claude Opus');
    expect(modelLabel('sonnet')).toBe('Claude Sonnet');
    expect(modelLabel('haiku')).toBe('Claude Haiku');
  });

  it('reads a pinned id as a name and a version', () => {
    expect(modelLabel('claude-opus-5')).toBe('Opus 5');
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5');
    expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1');
    // The dashes in a version are a decimal point in disguise.
    expect(modelLabel('claude-haiku-4-5')).toBe('Haiku 4.5');
  });

  it('drops the date suffix a fully qualified id carries', () => {
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
  });

  it('shows anything it cannot parse exactly as configured', () => {
    // The honest fallback: this is the string that will be handed to the agent.
    expect(modelLabel('gpt-5-2')).toBe('gpt-5-2');
    expect(modelLabel('some-future-model')).toBe('some-future-model');
  });
});
