import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { meanVelocity, simulate, sphereSource, spherePiece } from './helpers';
import { applyCut, planCut } from '../src/cut/cut';
import { centreOfMass, restVolume } from '../src/physics/metrics';
import type { CutPlan, Piece, Plane } from '../src/contracts';

const feature = await loadFeature('features/cut.feature');
const source = sphereSource(1);

describeFeature(feature, ({ Scenario }) => {
  let parent: Piece, plan: CutPlan, pieces: Piece[];
  let id = 1;
  const vertical = (x: number): Plane => ({ n: [1, 0, 0], d: x });
  const resting = (Given: (s: string, f: () => void) => void) =>
    Given('a sphere piece resting on the floor', () => { parent = spherePiece(0); simulate([parent], 0.5); });

  Scenario('Cutting a sphere through its middle makes two halves', ({ Given, When, Then, And }) => {
    resting(Given);
    When('it is cut by a vertical plane through its centre', () => {
      plan = planCut(source, [parent], vertical(centreOfMass(parent.sim)[0]), () => id++);
      pieces = applyCut([parent], plan);
    });
    Then('there are two pieces', () => expect(pieces).toHaveLength(2));
    And("their rest volumes add up to the parent's within 3 percent", () => {
      const sum = pieces.reduce((a, p) => a + restVolume(p.sim), 0);
      expect(Math.abs(sum / restVolume(parent.sim) - 1)).toBeLessThan(0.03);
    });
  });

  Scenario('A cut near the edge that would leave a crumb is refused', ({ Given, When, Then }) => {
    resting(Given);
    When('it is cut by a vertical plane that only grazes it', () => { plan = planCut(source, [parent], vertical(centreOfMass(parent.sim)[0] + 0.97), () => id++); });
    Then('the cut plan splits nothing', () => expect(plan.splits).toHaveLength(0));
  });

  Scenario("Children take over the parent's motion", ({ Given, When, Then }) => {
    let v0: number[];
    Given('a sphere piece moving sideways', () => {
      parent = spherePiece(5);
      for (let i = 0; i < parent.sim.vel.length; i += 3) { parent.sim.vel[i] = 3; parent.sim.vel[i + 1] = 0; parent.sim.vel[i + 2] = 0; }
      v0 = meanVelocity(parent.sim);
    });
    When('it is cut through its centre and the children are swapped in', () => {
      pieces = applyCut([parent], planCut(source, [parent], vertical(centreOfMass(parent.sim)[0]), () => id++));
    });
    Then("each child's mean velocity matches the parent's within 1 percent", () => {
      expect(pieces).toHaveLength(2);
      for (const p of pieces) expect(Math.abs(meanVelocity(p.sim)[0] / v0[0] - 1)).toBeLessThan(0.01);
    });
  });
});
