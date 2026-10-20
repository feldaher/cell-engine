import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { flatSheet, flatStrip, spherePiece, sum } from './helpers';
import { boundaryFaces } from '../src/mesh/boundary';
import { createSurfaceFieldSolver, type SurfaceMesh } from '../src/fields/fem';
import type { FieldSolver, FieldSpec } from '../src/contracts';

const feature = await loadFeature('features/surface-fields.feature');
const SIDE = 10;

function sheetSolver(side = SIDE, n = 20) {
  const surf = flatSheet(side, n);
  const fs = createSurfaceFieldSolver(surf);
  fs.assemble(surf);
  return { surf, fs, c: new Float64Array(fs.nNodes) };
}

/** Least-squares decay length of ln c against x over lo < x < hi. */
function fittedLength(pos: Float32Array, c: Float64Array, lo: number, hi: number) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < c.length; i++) {
    const x = pos[3 * i];
    if (x <= lo || x >= hi || c[i] <= 0) continue;
    const y = Math.log(c[i]);
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  return -1 / ((n * sxy - sx * sy) / (n * sxx - sx * sx));
}

describeFeature(feature, ({ Scenario }) => {
  let surf: SurfaceMesh, fs: FieldSolver, c: Float64Array;
  const givenSheet = (Given: (s: string, f: () => void) => void, text: string) =>
    Given(text, () => { ({ surf, fs, c } = sheetSolver()); });

  Scenario('The lumped mass is the surface area', ({ Given, Then, And }) => {
    givenSheet(Given, 'a flat square sheet of side 10');
    Then('the total lumped mass is the area of the sheet', () => expect(sum(fs.mass())).toBeCloseTo(SIDE * SIDE, 6));
    And('every row of the stiffness matrix sums to zero', () => {
      // A uniform field has no flux: stepping it with no decay and no source leaves it alone.
      const u = new Float64Array(fs.nNodes).fill(1);
      fs.step(u, { D: 5, k: 0 }, 10);
      for (const v of u) expect(Math.abs(v - 1)).toBeLessThan(1e-9);
    });
  });

  Scenario('Diffusion without decay conserves the total amount', ({ Given, When, Then, And }) => {
    let total0 = 0, spread0 = 0;
    const spread = (a: Float64Array) => Math.max(...a) - Math.min(...a);
    Given('a flat square sheet of side 10 with a pulse in one corner', () => {
      ({ surf, fs, c } = sheetSolver());
      for (let i = 0; i < c.length; i++) if (surf.pos[3 * i] < 2 && surf.pos[3 * i + 1] < 2) c[i] = 1;
      total0 = sum(c, fs.mass()); spread0 = spread(c);
    });
    When('it diffuses for many steps without decay', () => { for (let s = 0; s < 200; s++) fs.step(c, { D: 1, k: 0 }, 0.5); });
    Then('the total amount is unchanged', () => expect(Math.abs(sum(c, fs.mass()) / total0 - 1)).toBeLessThan(1e-9));
    And('the concentration has spread toward uniform', () => expect(spread(c)).toBeLessThan(spread0 / 3));
  });

  Scenario('Decay without diffusion follows an exponential', ({ Given, When, Then }) => {
    const k = 0.2, t = 10;
    Given('a flat square sheet of side 10 with a uniform species', () => { ({ surf, fs, c } = sheetSolver()); c.fill(0.7); });
    When('it decays for 10 minutes without diffusing', () => { for (let s = 0; s < 1000; s++) fs.step(c, { D: 0, k }, t / 1000); });
    Then('every node has fallen by exp minus k t', () => {
      for (const v of c) expect(Math.abs(v / (0.7 * Math.exp(-k * t)) - 1)).toBeLessThan(2e-3);
    });
  });

  Scenario('A gradient on a strip decays with length sqrt(D over k)', ({ Given, When, Then }) => {
    const D = 1, k = 0.25, LAMBDA = Math.sqrt(D / k);
    const spec: FieldSpec = { D, k };
    let clamp: Map<number, number>;
    Given('a long flat strip', () => {
      // 24 long at 0.35 spacing, so the decay length lambda = 2 is about six elements.
      surf = flatStrip(24, 1, 0.35);
      fs = createSurfaceFieldSolver(surf); fs.assemble(surf);
      c = new Float64Array(fs.nNodes);
      clamp = new Map();
      for (let i = 0; i < fs.nNodes; i++) if (surf.pos[3 * i] < 1e-6) clamp.set(i, 1);
    });
    When('a species is held at one end and reaches steady state', () => fs.steady(c, spec, undefined, clamp));
    Then('the concentration decays exponentially with length sqrt(D/k) within 5 percent', () => {
      expect(Math.abs(fittedLength(surf.pos, c, 2, 12) / LAMBDA - 1)).toBeLessThan(0.05);
    });
  });

  Scenario('Stretching the surface dilutes without creating or destroying', ({ Given, When, Then, And }) => {
    let total0 = 0;
    Given('a flat square sheet of side 10 with a uniform species', () => {
      ({ surf, fs, c } = sheetSolver()); c.fill(0.7); total0 = sum(c, fs.mass());
    });
    When('the sheet is stretched to 1.5 times its area', () => {
      for (let i = 0; i < surf.pos.length; i += 3) surf.pos[i] *= 1.5;
      fs.assemble(surf, [c]);
    });
    Then('the total amount is unchanged', () => expect(Math.abs(sum(c, fs.mass()) / total0 - 1)).toBeLessThan(1e-9));
    And('the concentration has fallen by a factor 1.5', () => {
      for (const v of c) expect(Math.abs(v / (0.7 / 1.5) - 1)).toBeLessThan(1e-4);
    });
  });

  Scenario('Diffusion on a sphere reaches a uniform steady state', ({ Given, When, Then, And }) => {
    let total0 = 0;
    Given('the boundary surface of a sphere of radius 1 with a pulse at the north pole', () => {
      const sim = spherePiece(0).sim;
      surf = { pos: sim.restPos, tris: boundaryFaces(sim) };
      fs = createSurfaceFieldSolver(surf); fs.assemble(surf);
      c = new Float64Array(fs.nNodes);
      for (let i = 0; i < c.length; i++) if (surf.pos[3 * i + 1] > 0.8) c[i] = 1;
      total0 = sum(c, fs.mass());
    });
    When('it diffuses for a long time without decay', () => { for (let s = 0; s < 200; s++) fs.step(c, { D: 1, k: 0 }, 0.5); });
    Then('the concentration is uniform within 1 percent', () => {
      // Only the boundary particles carry the field; the interior ones belong to no triangle.
      const m = fs.mass(), mean = total0 / sum(m);
      let checked = 0;
      for (let i = 0; i < c.length; i++) if (m[i] > 0) { expect(Math.abs(c[i] / mean - 1)).toBeLessThan(0.01); checked++; }
      expect(checked).toBeGreaterThan(100);
    });
    And('the total amount is unchanged', () => expect(Math.abs(sum(c, fs.mass()) / total0 - 1)).toBeLessThan(1e-9));
  });
});
