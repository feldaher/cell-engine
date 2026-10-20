import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { icosphere, icosphereDepth, icosphereForVolume, icosphereVolumeFactor, mergeTriMeshes, type TriMesh } from '../src/mesh/icosphere';
import { isClosed } from '../src/mesh/boundary';
import { cavityVolume } from '../src/physics/cavity';

const feature = await loadFeature('features/icosphere.feature');
const R = 2;
const ball = (4 / 3) * Math.PI * R ** 3;

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  ScenarioOutline('The sphere is closed and the right size', ({ Given, Then, And }, v) => {
    let m: TriMesh;
    const depth = Number(v.depth);
    Given('an icosphere of radius 2 subdivided <depth> times', () => { m = icosphere([0, 0, 0], R, depth); });
    Then('it has 20 times 4 to the <depth> triangles', () => expect(m.tris.length / 3).toBe(20 * 4 ** depth));
    And('every edge is shared by exactly two triangles', () => expect(isClosed(m.tris)).toBe(true));
    And('every vertex is 2 from the centre', () => {
      for (let i = 0; i < m.pos.length; i += 3) expect(Math.hypot(m.pos[i], m.pos[i + 1], m.pos[i + 2])).toBeCloseTo(R, 5);
    });
    And("the volume it encloses is under the sphere's by <under> percent, being inscribed", () => {
      const under = 100 * (1 - cavityVolume(m.pos, m.tris) / ball);
      expect(under).toBeGreaterThan(0);
      expect(Math.abs(under - Number(v.under))).toBeLessThan(0.1);
    });
  });

  Scenario('Triangles are wound outward', ({ Given, Then }) => {
    let m: TriMesh;
    Given('an icosphere of radius 2 subdivided 2 times', () => { m = icosphere([0, 0, 0], R, 2); });
    Then("every triangle's normal points away from the centre", () => {
      for (let t = 0; t < m.tris.length; t += 3) {
        const a = 3 * m.tris[t], b = 3 * m.tris[t + 1], c = 3 * m.tris[t + 2];
        const ux = m.pos[b] - m.pos[a], uy = m.pos[b + 1] - m.pos[a + 1], uz = m.pos[b + 2] - m.pos[a + 2];
        const wx = m.pos[c] - m.pos[a], wy = m.pos[c + 1] - m.pos[a + 1], wz = m.pos[c + 2] - m.pos[a + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        expect(m.pos[a] * nx + m.pos[a + 1] * ny + m.pos[a + 2] * nz).toBeGreaterThan(0);
      }
    });
  });

  Scenario('A sphere can be asked for a volume rather than a radius', ({ Given, Then, And }) => {
    const want = (4 / 3) * Math.PI * 100 ** 3;
    let m: TriMesh;
    Given('an icosphere built to enclose the volume of a 100 micrometre sphere', () => { m = icosphereForVolume([0, 0, 0], want, 3); });
    Then('the volume it encloses is that volume', () => expect(cavityVolume(m.pos, m.tris) / want).toBeCloseTo(1, 6));
    And('its radius is a little larger than 100 micrometres', () => {
      const r = Math.hypot(m.pos[0], m.pos[1], m.pos[2]);
      expect(r).toBeGreaterThan(100);
      expect(r).toBeLessThan(101);
      expect(icosphereVolumeFactor(3)).toBeLessThan(1);
    });
  });

  Scenario('Merging spheres keeps each one closed', ({ Given, Then, And }) => {
    let a: TriMesh, b: TriMesh, m: TriMesh;
    Given('two icospheres merged into one mesh', () => {
      a = icosphere([0, 0, 0], R, 2);
      b = icosphere([10, 0, 0], 1, 2);
      m = mergeTriMeshes([a, b]);
    });
    Then("the mesh has both spheres' triangles", () => {
      expect(m.tris.length).toBe(a.tris.length + b.tris.length);
      expect(isClosed(m.tris)).toBe(true);
      expect(icosphereDepth(R, (1.0515 * R) / 4)).toBe(2);
    });
    And('the volume it encloses is the sum of the two', () => {
      expect(cavityVolume(m.pos, m.tris)).toBeCloseTo(cavityVolume(a.pos, a.tris) + cavityVolume(b.pos, b.tris), 4);
    });
  });
});
