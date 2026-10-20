// From regrow 59d75d4, tests/fields.test.ts.
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { bar, sum } from './helpers';
import { createFieldSolver } from '../src/fields/fem';
import type { FieldSolver, FieldSpec, SimMesh } from '../src/contracts';

const feature = await loadFeature('features/fields.feature');
const D = 1, k = 0.25, LAMBDA = Math.sqrt(D / k); // λ = 2 bar units; mesh spacing 0.35 ≈ λ/6
const spec: FieldSpec = { D, k };

/** Nodes of the rounded proximal cap (x < 0) are held at c = 1. */
function capClamp(sim: SimMesh) {
  const m = new Map<number, number>();
  for (let i = 0; i < sim.restPos.length / 3; i++) if (sim.restPos[3 * i] < 0) m.set(i, 1);
  return m;
}

/** Least-squares slope of ln c against x over nodes with lo < x < hi → decay length. */
function fittedLength(sim: SimMesh, c: Float64Array, lo: number, hi: number) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < c.length; i++) {
    const x = sim.restPos[3 * i];
    if (x <= lo || x >= hi) continue;
    const y = Math.log(c[i]);
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return -1 / slope;
}

describeFeature(feature, ({ Scenario }) => {
  let sim: SimMesh, fs: FieldSolver, c: Float64Array;
  const givenBar = (Given: (s: string, f: () => void) => void) =>
    Given('a long bar', () => { sim = bar(); fs = createFieldSolver(sim); fs.assemble(sim); c = new Float64Array(fs.nNodes); });

  Scenario('A source-sink gradient decays with length sqrt(D/k)', ({ Given, When, Then }) => {
    givenBar(Given);
    When('a species is held at one end and reaches steady state', () => fs.steady(c, spec, undefined, capClamp(sim)));
    Then('the concentration decays exponentially with length sqrt(D/k) within 5 percent', () => {
      expect(Math.abs(fittedLength(sim, c, 2, 12) / LAMBDA - 1)).toBeLessThan(0.05);
    });
  });

  Scenario('Diffusion without decay conserves the total amount', ({ Given, When, Then, And }) => {
    let total0 = 0, spread0 = 0;
    const spread = (a: Float64Array) => Math.max(...a) - Math.min(...a);
    Given('a long bar with a pulse of a species at one end', () => {
      sim = bar(); fs = createFieldSolver(sim); fs.assemble(sim);
      c = new Float64Array(fs.nNodes);
      for (let i = 0; i < c.length; i++) if (sim.restPos[3 * i] < 2) c[i] = 1;
      total0 = sum(c, fs.mass()); spread0 = spread(c);
    });
    When('it diffuses for many steps without decay', () => { for (let s = 0; s < 200; s++) fs.step(c, { ...spec, k: 0 }, 0.5); });
    Then('the total amount is unchanged', () => expect(Math.abs(sum(c, fs.mass()) / total0 - 1)).toBeLessThan(1e-9));
    And('the concentration has spread toward uniform', () => expect(spread(c)).toBeLessThan(spread0 / 3));
  });

  Scenario('Time stepping converges to the steady state', ({ Given, When, Then }) => {
    givenBar(Given);
    When('a species held at one end is stepped for a long time', () => { for (let s = 0; s < 400; s++) fs.step(c, spec, 1, undefined, capClamp(sim)); });
    Then('it matches the steady-state solution', () => {
      const ss = new Float64Array(fs.nNodes);
      fs.steady(ss, spec, undefined, capClamp(sim));
      let worst = 0;
      for (let i = 0; i < c.length; i++) worst = Math.max(worst, Math.abs(c[i] - ss[i]));
      expect(worst).toBeLessThan(1e-4);
    });
  });

  Scenario('Growth dilutes a species without creating or destroying it', ({ Given, When, Then, And }) => {
    let total0 = 0;
    Given('a long bar with a uniform species', () => {
      sim = bar(); fs = createFieldSolver(sim); fs.assemble(sim);
      c = new Float64Array(fs.nNodes).fill(0.7);
      total0 = sum(c, fs.mass());
    });
    When('the bar grows uniformly to 1.5 times its volume', () => {
      const s = Math.cbrt(1.5);
      for (let i = 0; i < sim.pos.length; i++) sim.pos[i] *= s;
      fs.assemble(sim, [c]);
    });
    Then('the total amount is unchanged', () => expect(Math.abs(sum(c, fs.mass()) / total0 - 1)).toBeLessThan(1e-9));
    And('the concentration has fallen by a factor 1.5', () => {
      // Positions are float32: coordinates up to ~24 against edges ~0.35 round each edge by
      // ~(24/0.35)·6e-8 ≈ 4e-6 relative, so tet volumes (and c) carry ~1e-5. Amounts stay exact.
      for (let i = 0; i < c.length; i++) expect(Math.abs(c[i] / (0.7 / 1.5) - 1)).toBeLessThan(1e-4);
    });
  });
});
