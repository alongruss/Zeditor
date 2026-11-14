import { describe, expect, it } from 'vitest';
import {
  SCRUB_PIXELS_PER_STEP,
  formatNumber,
  parseNumber,
  scrubValue,
  stepNumber,
  stepSize,
  trackScrub,
  type ScrubTrack,
} from './fields';

describe('parseNumber', () => {
  it('accepts finite numbers', () => {
    expect(parseNumber('4')).toBe(4);
    expect(parseNumber(' -2.5 ')).toBe(-2.5);
    expect(parseNumber('0')).toBe(0);
  });

  it('rejects half-typed or invalid text instead of applying 0 or NaN', () => {
    for (const text of ['', ' ', '-', '.', 'abc', 'Infinity', '1e999']) {
      expect(parseNumber(text), JSON.stringify(text)).toBeNull();
    }
  });

  it('applies min and integer rules', () => {
    expect(parseNumber('2', { min: 3 })).toBeNull();
    expect(parseNumber('3', { min: 3 })).toBe(3);
    expect(parseNumber('3.5', { integer: true })).toBeNull();
    expect(parseNumber('5', { integer: true })).toBe(5);
    expect(parseNumber('101', { max: 100 })).toBeNull();
    expect(parseNumber('100', { max: 100 })).toBe(100);
  });
});

describe('stepNumber', () => {
  it('steps without float noise', () => {
    expect(stepNumber(0.1, 0.2)).toBe(0.3);
    expect(stepNumber(1, -0.5)).toBe(0.5);
  });

  it('keeps within max', () => {
    expect(stepNumber(98, 5, 0, 100)).toBe(100);
    expect(stepNumber(100, -5, 0, 100)).toBe(95);
  });

  it('respects min', () => {
    expect(stepNumber(0.2, -0.5, 0)).toBe(0);
  });
});

describe('formatNumber', () => {
  it('trims float noise', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(-4)).toBe('-4');
  });
});

describe('stepSize', () => {
  it('uses the Shift step when held, or ten steps if the field has none', () => {
    expect(stepSize({ step: 1, shiftStep: 15 }, true)).toBe(15);
    expect(stepSize({ step: 0.5 }, true)).toBe(5);
    expect(stepSize({ step: 0.5, shiftStep: 15 }, false)).toBe(0.5);
  });
});

describe('scrubValue (dragging a field label)', () => {
  const units = { step: 0.5 };

  it('changes one step per few pixels, in the drag direction', () => {
    expect(scrubValue(2, SCRUB_PIXELS_PER_STEP * 3, units, false)).toBe(3.5);
    expect(scrubValue(2, -SCRUB_PIXELS_PER_STEP * 2, units, false)).toBe(1);
  });

  it('ignores movement smaller than one step', () => {
    expect(scrubValue(2, SCRUB_PIXELS_PER_STEP - 1, units, false)).toBe(2);
    expect(scrubValue(2, -(SCRUB_PIXELS_PER_STEP - 1), units, false)).toBe(2);
  });

  it('uses the bigger step with Shift', () => {
    expect(scrubValue(0, SCRUB_PIXELS_PER_STEP * 2, { step: 1, shiftStep: 15 }, true)).toBe(30);
  });

  it('respects min and whole numbers', () => {
    expect(scrubValue(3, -SCRUB_PIXELS_PER_STEP * 10, { step: 1, min: 3, integer: true }, false)).toBe(3);
    expect(scrubValue(1, -SCRUB_PIXELS_PER_STEP * 10, { step: 0.1, min: 0 }, false)).toBe(0);
    expect(scrubValue(95, SCRUB_PIXELS_PER_STEP * 10, { step: 1, max: 100 }, false)).toBe(100);
  });
});

describe('trackScrub (label drag, with or without the pointer locked)', () => {
  const start: ScrubTrack = { offset: 0, lastX: 100 };
  const follow = (moves: [clientX: number, movementX: number, locked: boolean][]) =>
    moves.reduce((track, [x, mx, locked]) => trackScrub(track, x, mx, locked), start).offset;

  it('follows the cursor while the pointer is free, ignoring movementX', () => {
    expect(follow([[110, 999, false], [130, -999, false]])).toBe(30);
  });

  it('adds up movementX while locked and the cursor stays put (past the screen edge)', () => {
    // 10 px, then the lock starts and the cursor freezes at 110.
    expect(follow([[110, 10, false], [110, 25, true], [110, 25, true]])).toBe(60);
  });

  // CI: Chromium on Linux reported huge movementX values for test-driven
  // mouse moves once locked, turning a 40 px drag into -1000 px.
  it('trusts the cursor over movementX whenever the cursor moves, even while locked', () => {
    expect(follow([[105, 5, false], [110, -800, true], [140, 900, true]])).toBe(40);
  });

  it('carries on from where it got to if the lock ends mid-drag', () => {
    // Locked at 110 after 10 px, then 50 px of locked movement; Esc shows the
    // cursor again at 110, and it moves on 5 px.
    expect(follow([[110, 10, false], [110, 50, true], [110, 0, false], [115, 5, false]])).toBe(65);
  });

  it('ignores movementX while not locked and the cursor stays put', () => {
    expect(follow([[100, 7, false]])).toBe(0);
  });
});
