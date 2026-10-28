import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { bounds, drawPlot, niceTicks, toPixel, type Axes, type Series } from '../src/ui/plot';

const feature = await loadFeature('features/plot.feature');

/** Just enough of a 2D context to count strokes. */
function recorder() {
  const calls: string[] = [];
  const ctx: Record<string, unknown> = { canvas: { width: 200, height: 100 } };
  for (const m of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'fillText', 'setLineDash', 'save', 'restore', 'fillRect']) ctx[m] = () => calls.push(m);
  ctx.stroke = () => calls.push('stroke');
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('Ticks fall on round numbers inside the range', ({ When, Then }) => {
    let t: number[] = [];
    When('ticks are chosen for 0 to 47 with at most 6', () => { t = niceTicks(0, 47, 6); });
    Then('they are 0, 10, 20, 30 and 40', () => expect(t).toEqual([0, 10, 20, 30, 40]));
    When('ticks are chosen for 0.2 to 0.9 with at most 5', () => { t = niceTicks(0.2, 0.9, 5); });
    Then('they step by 0.2 and lie within the range', () => {
      for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeCloseTo(0.2, 9);
      for (const x of t) { expect(x).toBeGreaterThanOrEqual(0.2 - 1e-9); expect(x).toBeLessThanOrEqual(0.9 + 1e-9); }
    });
  });

  Scenario('Bounds cover every series, and a flat series still has a span', ({ Given, Then }) => {
    let s: Series[];
    Given('two series, one from 0 to 10 minutes and one flat at 0.5', () => {
      s = [{ label: 'a', colour: '#000', points: [[0, 0.5], [10, 0.5]] }, { label: 'b', colour: '#000', points: [[2, 0.5]] }];
    });
    Then('the bounds run from 0 to 10 in x and enclose 0.5 in y with a non-zero height', () => {
      const b = bounds(s);
      expect(b.x).toEqual([0, 10]);
      expect(b.y[0]).toBeLessThan(0.5); expect(b.y[1]).toBeGreaterThan(0.5);
    });
  });

  Scenario('Data maps to pixels with y pointing up', ({ Given, Then, And }) => {
    let f: (x: number, y: number) => [number, number];
    Given('axes from 0 to 10 and 0 to 1 on a 200 by 100 box with a margin of 10', () => { f = toPixel({ x: [0, 10], y: [0, 1] }, 200, 100, 10); });
    Then('the point (0, 0) is at the bottom left inside the margin', () => expect(f(0, 0)).toEqual([10, 90]));
    And('the point (10, 1) is at the top right inside the margin', () => expect(f(10, 1)).toEqual([190, 10]));
  });

  Scenario('Drawing touches the canvas once per visible series and once per mark', ({ Given, When, Then }) => {
    let r: ReturnType<typeof recorder>;
    Given('a recording canvas', () => { r = recorder(); });
    When('two series, one of them faint and one empty, and one mark are drawn', () => {
      const axes: Axes = { x: [0, 10], y: [0, 1] };
      drawPlot(r.ctx, [
        { label: 'a', colour: '#000', points: [[0, 0], [5, 1]] },
        { label: 'b', colour: '#000', points: [[0, 1], [5, 0]], faint: true },
        { label: 'c', colour: '#000', points: [] },
      ], axes, { marks: [3], grid: false });
    });
    Then('one path is stroked per non-empty series and one per mark', () => expect(r.calls.filter((c) => c === 'stroke').length).toBe(3));
  });
});
