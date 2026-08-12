import { describe, expect, it } from 'vitest';
import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('starts at zero', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('counts seconds and minutes', () => {
    expect(formatDuration(62_000)).toBe('00:01:02');
  });

  it('rolls into hours', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('keeps counting past a day rather than wrapping', () => {
    expect(formatDuration(90_061_000)).toBe('25:01:01');
  });

  it('treats a negative clock skew as zero', () => {
    expect(formatDuration(-5_000)).toBe('00:00:00');
  });
});
