import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { simulate, spherePiece, unitCube } from './helpers';
import { boundaryFaces } from '../src/mesh/boundary';
import { cavityPressure, cavityVolume, solveCavities, type Cavity } from '../src/physics/cavity';
import { defaultParams } from '../src/physics/params';
import type { Piece } from '../src/contracts';

const feature = await loadFeature('features/cavity.feature');
const SUB = 12, DT = 1 / 60, H = DT / SUB;

/** A sphere piece whose boundary is held to a cavity target, settled for `seconds`. */
function hollow(): { piece: Piece; cav: Cavity } {
  const piece = spherePiece(0);
  const tris = boundaryFaces(piece.sim);
  const cav: Cavity = { tris, target: cavityVolume(piece.sim.pos, tris), compliance: 0, lambda: 0 };
  return { piece, cav };
}

function settle(piece: Piece, cav: Cavity, seconds: number) {
  simulate([piece], seconds, { ...defaultParams(), substeps: SUB, gravity: 0 }, {
    constrain: (pieces) => solveCavities(pieces[0].sim, [cav], H),
  });
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('The enclosed volume of a known shape is exact', ({ Given, Then, And }) => {
    let cube: ReturnType<typeof unitCube>;
    Given('the boundary surface of a unit cube', () => { cube = unitCube(); });
    Then('the enclosed volume is 1', () => expect(cavityVolume(cube.pos, cube.tris)).toBeCloseTo(1, 10));
    And('it is unchanged when the cube is moved far from the origin', () => {
      for (let i = 0; i < cube.pos.length; i += 3) { cube.pos[i] += 1000; cube.pos[i + 1] -= 500; cube.pos[i + 2] += 250; }
      expect(cavityVolume(cube.pos, cube.tris)).toBeCloseTo(1, 4);
    });
  });

  Scenario('The boundary of a tet mesh is closed', ({ Given, When, Then, And }) => {
    let piece: Piece, tris: Uint32Array;
    Given('a sphere mesh of radius 1', () => { piece = spherePiece(0); });
    When('its boundary faces are taken', () => { tris = boundaryFaces(piece.sim); });
    Then('every edge is shared by exactly two faces', () => {
      const count = new Map<string, number>();
      for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = tris[t + e], b = tris[t + ((e + 1) % 3)];
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
      for (const c of count.values()) expect(c).toBe(2);
    });
    And('the enclosed volume is within 5 percent of four thirds pi', () => {
      expect(Math.abs(cavityVolume(piece.sim.restPos, tris) / ((4 / 3) * Math.PI) - 1)).toBeLessThan(0.05);
    });
  });

  Scenario('The gradient of the volume is the area-weighted normal', ({ Given, Then }) => {
    let piece: Piece;
    Given('a sphere mesh of radius 1', () => { piece = spherePiece(0); });
    Then('moving every boundary particle a little along the volume gradient changes the volume as predicted', () => {
      const sim = piece.sim, tris = boundaryFaces(sim);
      // Read the gradient by solving one step against a target an epsilon away with unit masses.
      const v0 = cavityVolume(sim.pos, tris);
      const eps = 1e-4 * v0;
      const cav: Cavity = { tris, target: v0 + eps, compliance: 0, lambda: 0 };
      solveCavities(sim, [cav], H);
      // One exact Newton step on a linear constraint lands on the target.
      expect(Math.abs(cavityVolume(sim.pos, tris) - (v0 + eps)) / eps).toBeLessThan(0.01);
    });
  });

  Scenario('A cavity driven to a larger target inflates to it', ({ Given, When, Then, And }) => {
    let h: ReturnType<typeof hollow>, v0 = 0;
    Given('a hollow sphere whose cavity is held to its own volume', () => { h = hollow(); v0 = h.cav.target; });
    When('the target is raised by 10 percent and it settles', () => { h.cav.target = 1.1 * v0; settle(h.piece, h.cav, 1.5); });
    Then('the enclosed volume is within 1 percent of the target', () => {
      expect(Math.abs(cavityVolume(h.piece.sim.pos, h.cav.tris) / h.cav.target - 1)).toBeLessThan(0.01);
    });
    And('the cavity pressure is positive', () => expect(cavityPressure(h.cav, H)).toBeGreaterThan(0));
  });

  Scenario('A cavity driven to a smaller target deflates and pulls inward', ({ Given, When, Then, And }) => {
    let h: ReturnType<typeof hollow>, v0 = 0;
    Given('a hollow sphere whose cavity is held to its own volume', () => { h = hollow(); v0 = h.cav.target; });
    When('the target is lowered by 10 percent and it settles', () => { h.cav.target = 0.9 * v0; settle(h.piece, h.cav, 1.5); });
    Then('the enclosed volume is within 1 percent of the target', () => {
      expect(Math.abs(cavityVolume(h.piece.sim.pos, h.cav.tris) / h.cav.target - 1)).toBeLessThan(0.01);
    });
    And('the cavity pressure is negative', () => expect(cavityPressure(h.cav, H)).toBeLessThan(0));
  });
});
