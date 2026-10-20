import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { capsuleMesh } from './helpers';
import { step, type SolverParams } from '../src/physics/soft';
import type { SimMesh } from '../src/contracts';

const feature = await loadFeature('features/soft.feature');
const LEN = 4, PULL = 1.2;
/** Compliance of the pull, already divided by h², held fixed so it scales like the tissue's own (see soft.ts). */
const PULL_COMPLIANCE = 0.02;

function heldBar(): { sim: SimMesh; held: number[]; pulled: number[] } {
  const sim = capsuleMesh([0, 0, 0], [LEN, 0, 0], 0.5, 0.25);
  const held: number[] = [], pulled: number[] = [];
  for (let i = 0; i < sim.restPos.length / 3; i++) {
    if (sim.restPos[3 * i] < 0) { held.push(i); sim.invMass[i] = 0; }
    else if (sim.restPos[3 * i] > LEN) pulled.push(i);
  }
  return { sim, held, pulled };
}

/** Pulls the far cap toward rest + PULL along x, as a compliant constraint, then measures the bar. */
function settle(substeps: number) {
  const b = heldBar(), s = b.sim;
  const p: SolverParams = { substeps, softness: 100, lambdaOverMu: 20, damping: 20, materialStiffness: [1] };
  const pull = () => {
    for (const i of b.pulled) {
      const C = s.pos[3 * i] - (s.restPos[3 * i] + PULL), w = s.invMass[i];
      s.pos[3 * i] -= (w * C) / (w + PULL_COMPLIANCE);
    }
  };
  for (let f = 0; f < 240; f++) step(s, p, 1 / 60, pull);
  let x = 0;
  for (const i of b.pulled) x += s.pos[3 * i] / b.pulled.length;
  return { length: x, bar: b };
}

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  const reference = settle(8).length;

  ScenarioOutline('A held, pulled bar settles to the same length', ({ Given, When, Then }, v) => {
    let length = 0;
    Given('a bar held at one end', () => {});
    When('its free end is pulled with a constant force and it settles with <substeps> substeps', () => { length = settle(Number(v.substeps)).length; });
    Then('its length is within 1 percent of the length reached with 8 substeps', () => expect(Math.abs(length / reference - 1)).toBeLessThan(0.01));
  });

  Scenario('Held particles do not move', ({ Given, When, Then }) => {
    let r: ReturnType<typeof settle>;
    Given('a bar held at one end', () => {});
    When('its free end is pulled with a constant force and it settles with 4 substeps', () => { r = settle(4); });
    Then('the held particles are where they started', () => {
      const s = r.bar.sim;
      for (const i of r.bar.held) for (let k = 0; k < 3; k++) expect(s.pos[3 * i + k]).toBe(s.restPos[3 * i + k]);
    });
  });
});
