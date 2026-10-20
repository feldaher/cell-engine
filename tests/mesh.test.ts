import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { sphereShape, sphereSource } from './helpers';
import { buildSimMesh, tetVolume } from '../src/mesh/tetgen';
import { buildPiece } from '../src/mesh/piece';
import type { Piece, Shape, SimMesh } from '../src/contracts';

const feature = await loadFeature('features/mesh.feature');
const total = (s: SimMesh) => s.restVol.reduce((a, v) => a + v, 0);

describeFeature(feature, ({ Scenario }) => {
  let shape: Shape, sim: SimMesh, piece: Piece;
  const whenBuilt = (When: (s: string, f: () => void) => void) => When('its simulation mesh is built', () => { sim = buildSimMesh(shape); });

  Scenario('A sphere meshes to its own volume', ({ Given, When, Then, And }) => {
    Given('a sphere of radius 1', () => { shape = sphereShape(1); });
    whenBuilt(When);
    Then('the rest volume is within 5 percent of four thirds pi', () => expect(Math.abs(total(sim) / ((4 / 3) * Math.PI) - 1)).toBeLessThan(0.05));
    And('every tetrahedron is positively oriented', () => {
      for (let t = 0; t < sim.tets.length / 4; t++) expect(tetVolume(sim.restPos, sim.tets[4 * t], sim.tets[4 * t + 1], sim.tets[4 * t + 2], sim.tets[4 * t + 3])).toBeGreaterThan(0);
    });
  });

  Scenario('Every tetrahedron takes the material at its centroid', ({ Given, When, Then }) => {
    Given('a sphere of radius 1 whose upper half is material 3', () => { shape = sphereShape(1, [], (_x, y) => (y > 0 ? 3 : 0)); });
    whenBuilt(When);
    Then('tetrahedra with centroids above the equator are material 3 and the others material 0', () => {
      for (let t = 0; t < sim.tets.length / 4; t++) {
        let y = 0;
        for (let k = 0; k < 4; k++) y += sim.restPos[3 * sim.tets[4 * t + k] + 1] / 4;
        expect(sim.tetMaterial[t]).toBe(y > 0 ? 3 : 0);
      }
    });
  });

  Scenario('A cut plane clips the mesh', ({ Given, When, Then, And }) => {
    Given('a sphere of radius 1 cut by the plane x = 0', () => { shape = sphereShape(1, [{ n: [1, 0, 0], d: 0 }]); });
    whenBuilt(When);
    Then('no particle lies beyond the plane', () => { for (let i = 0; i < sim.restPos.length; i += 3) expect(sim.restPos[i]).toBeLessThan(1e-3); });
    And('the rest volume is within 6 percent of half the sphere', () => expect(Math.abs(total(sim) / ((2 / 3) * Math.PI) - 1)).toBeLessThan(0.06));
  });

  Scenario('The skin is a closed surface facing outward', ({ Given, When, Then, And }) => {
    Given('a sphere of radius 1', () => { shape = sphereShape(1); });
    When('its piece is built', () => { piece = buildPiece(sphereSource(1), [], 0); });
    Then('every edge of the skin is shared by exactly two triangles', () => {
      const count = new Map<string, number>(), idx = piece.skin.idx;
      for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = idx[t + e], b = idx[t + ((e + 1) % 3)], key = a < b ? `${a},${b}` : `${b},${a}`;
        count.set(key, (count.get(key) ?? 0) + 1);
      }
      for (const c of count.values()) expect(c).toBe(2);
    });
    And('the skin normals point away from the centre', () => {
      const { pos, normal } = piece.skin;
      for (let v = 0; v < pos.length; v += 3) expect(pos[v] * normal[v] + pos[v + 1] * normal[v + 1] + pos[v + 2] * normal[v + 2]).toBeGreaterThan(0);
    });
  });
});
