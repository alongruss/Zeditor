import { describe, expect, it } from 'vitest';
import { playbackTime } from './timeline';

describe('playbackTime', () => {
  it('moves on smoothly, a fraction of a frame at a time', () => {
    expect(playbackTime(0, 10, 30, 90)).toBe(10);
    expect(playbackTime(50, 10, 30, 90)).toBeCloseTo(11.5, 9);
    expect(playbackTime(1000 / 60, 0, 30, 90)).toBeCloseTo(0.5, 9); // one 60 Hz refresh: half a frame
  });

  it('loops over the length, and copes with a length of 0', () => {
    expect(playbackTime(3000, 0, 30, 90)).toBeCloseTo(0, 9);
    expect(playbackTime(3100, 80, 30, 90)).toBeCloseTo(83, 9);
    expect(playbackTime(500, 0, 30, 0)).toBeCloseTo(0, 9);
  });
});
