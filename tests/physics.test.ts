import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { simulate, spherePiece } from './helpers';
import { defaultParams } from '../src/physics/params';
import { centreOfMass, currentVolume, kinetic, restVolume } from '../src/physics/metrics';
import type { Piece } from '../src/contracts';

const feature = await loadFeature('features/physics.feature');

describeFeature(feature, ({ Scenario }) => {
  let body: Piece;
  const resting = (Given: (s: string, f: () => void) => void) =>
    Given('a sphere resting on the floor', () => { body = spherePiece(0); simulate([body], 1); });

  Scenario('A body left on the floor comes to rest', ({ Given, When, Then, And }) => {
    resting(Given);
    When('two seconds are simulated', () => simulate([body], 2));
    // Compared with the energy of the body moving as a whole at 1 unit/s (Jelly Cells' criterion).
    Then('the kinetic energy is almost zero', () => expect(kinetic(body.sim)).toBeLessThan(0.5 * restVolume(body.sim) * 1.0));
    And('the volume is within 2 percent of rest', () => expect(Math.abs(currentVolume(body.sim) / restVolume(body.sim) - 1)).toBeLessThan(0.02));
  });

  Scenario('Damping does not slow a falling body', ({ Given, When, Then }) => {
    let y0 = 0, g = 0;
    Given('a sphere high above the floor', () => { body = spherePiece(50); });
    When('a tenth of a second is simulated with syrupy damping', () => {
      y0 = centreOfMass(body.sim)[1];
      const p = { ...defaultParams(), damping: 1 };
      g = p.gravity;
      simulate([body], 0.1, p);
    });
    Then('the centre of mass has accelerated at g', () => {
      const fallen = y0 - centreOfMass(body.sim)[1];
      expect(Math.abs(fallen / (0.5 * g * 0.1 * 0.1) - 1)).toBeLessThan(0.05);
    });
  });

  Scenario('A smaller rest volume shrinks the body', ({ Given, When, Then }) => {
    let v0 = 0;
    resting(Given);
    When('its rest volume is set to 70 percent and it settles', () => { v0 = restVolume(body.sim); simulate([body], 2, { ...defaultParams(), volume: 0.7 }); });
    Then('its volume is within 3 percent of 70 percent of the original', () => expect(Math.abs(currentVolume(body.sim) / (0.7 * v0) - 1)).toBeLessThan(0.03));
  });

  Scenario('Extra solid-contact passes leave a single body unchanged', ({ Given, When, Then }) => {
    let a: Piece, b: Piece;
    Given('two identical spheres resting on the floor', () => { a = spherePiece(0.5); b = spherePiece(0.5); });
    When('one is simulated with one solid-contact pass and the other with two', () => {
      simulate([a], 1, defaultParams());
      simulate([b], 1, { ...defaultParams(), solidIters: 2 });
    });
    Then('they end in the same place', () => { for (let i = 0; i < a.sim.pos.length; i++) expect(b.sim.pos[i]).toBeCloseTo(a.sim.pos[i], 6); });
  });
});
