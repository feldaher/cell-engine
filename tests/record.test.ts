import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { Recorder, rng } from '../src/game/record';

const feature = await loadFeature('features/record.feature');
const lerp = (a: number, b: number, w: number) => a + (b - a) * w;

describeFeature(feature, ({ Scenario }) => {
  Scenario('Frames are kept at each multiple of the interval', ({ Given, When, Then }) => {
    let r: Recorder<number>;
    Given('a recorder with an interval of 15', () => { r = new Recorder<number>(15); });
    When('time advances from 0 to 50 in steps of 4', () => { for (let t = 0; t <= 50; t += 4) r.capture(t, () => t); });
    Then('it holds frames at 0, 15, 30 and 45', () => expect(r.times).toEqual([0, 15, 30, 45]));
  });

  Scenario('Scrubbing interpolates between frames', ({ Given, When, Then, And }) => {
    let r: Recorder<number>;
    Given('a recorder with an interval of 10 that interpolates numbers', () => { r = new Recorder<number>(10, lerp); });
    When('it records the values 0 and 10 at times 0 and 10', () => { r.capture(0, () => 0); r.capture(10, () => 10); });
    Then('the value at time 2.5 is 2.5', () => expect(r.at(2.5)).toBeCloseTo(2.5, 12));
    And('a time past the end gives the last frame and a time before the start gives the first', () => {
      expect(r.at(99)).toBe(10); expect(r.at(-5)).toBe(0);
    });
  });

  Scenario('Without interpolation the frame at or before the time is shown', ({ Given, When, Then }) => {
    let r: Recorder<number>;
    Given('a recorder with an interval of 10 that does not interpolate', () => { r = new Recorder<number>(10); });
    When('it records the values 0 and 10 at times 0 and 10', () => { r.capture(0, () => 0); r.capture(10, () => 10); });
    Then('the value at time 7 is 0', () => expect(r.at(7)).toBe(0));
  });

  Scenario('A seeded generator replays exactly', ({ Given, Then, And }) => {
    let a: () => number, b: () => number, c: () => number;
    Given('two generators with seed 42 and one with seed 43', () => { a = rng(42); b = rng(42); c = rng(43); });
    Then('the first two give the same thousand numbers, all in 0 to 1', () => {
      for (let i = 0; i < 1000; i++) { const x = a(); expect(b()).toBe(x); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    });
    And('the third differs', () => { const xs = Array.from({ length: 10 }, a), zs = Array.from({ length: 10 }, c); expect(zs).not.toEqual(xs); });
  });
});
