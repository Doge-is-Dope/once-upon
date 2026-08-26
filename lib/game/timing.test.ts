import { describe, expect, it } from 'vitest';
import { displaySeconds, measureServerClock, remainingMs } from './timing';

describe('server clock', () => {
  it('uses the request midpoint for a stable offset', () => {
    const clock = measureServerClock(11_000, 900, 1_100);
    expect(clock.offsetMs).toBe(10_000);
    expect(remainingMs(15_000, clock, 2_000)).toBe(3_000);
  });

  it('ceil-displays seconds and never goes negative', () => {
    expect(displaySeconds(3_001)).toBe(4);
    expect(remainingMs(1_000, { offsetMs: 0, measuredAtMonoMs: 0 }, 2_000)).toBe(0);
  });
});
