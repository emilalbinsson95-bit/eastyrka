import { describe, expect, it } from 'vitest';
import { matchesWarmupLoad, WARMUP_RPES } from './warmupReference';
describe('warmup reference', () => {
  it('requires the exact configured load for the matching competition lift', () => {
    expect(matchesWarmupLoad('Back squat', null, 60, { squat: 60 })).toBe(true);
    expect(matchesWarmupLoad('Bench press', null, 60, { squat: 60 })).toBe(false);
    expect(matchesWarmupLoad('Back squat', null, 60.5, { squat: 60 })).toBe(false);
    expect(matchesWarmupLoad('Back squat', 'Tempo', 60, { squat: 60 })).toBe(false);
    expect(matchesWarmupLoad('Back squat', null, 0, { squat: 0 })).toBe(false);
  });
  it('offers RPE 6–10 in half steps', () => {
    expect(WARMUP_RPES).toEqual([6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
  });
});
