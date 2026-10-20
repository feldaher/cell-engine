import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { sphereShape, sphereSource } from './helpers';
import { buildSimMesh } from '../src/mesh/tetgen';
import { buildPiece } from '../src/mesh/piece';
import { embedMesh, embedPoints, moveEmbedded, TetGrid, updateSkin } from '../src/mesh/embed';
import { rng } from '../src/math/mat3';
import type { Piece, SimMesh } from '../src/contracts';

const feature = await loadFeature('features/embed.feature');
// x ↦ A·x + t
const A = [1.4, 0.2, 0, 0.3, 0.8, 0.1, 0, -0.2, 1.1], t = [2, -1, 0.5];
const map = (x: number, y: number, z: number) => [0, 1, 2].map((r) => A[3 * r] * x + A[3 * r + 1] * y + A[3 * r + 2] * z + t[r]);

describeFeature(feature, ({ Scenario }) => {
  Scenario('An embedded point follows an affine deformation exactly', ({ Given, When, Then }) => {
    let sim: SimMesh, pts: Float32Array, e: ReturnType<typeof embedPoints>;
    const out = new Float32Array(300);
    Given('a sphere mesh and points scattered inside it', () => {
      sim = buildSimMesh(sphereShape(1));
      const r = rng(5);
      pts = new Float32Array(300);
      for (let i = 0; i < 100; i++) {
        let x, y, z;
        do { x = 2 * r() - 1; y = 2 * r() - 1; z = 2 * r() - 1; } while (x * x + y * y + z * z > 0.7);
        pts.set([x, y, z], 3 * i);
      }
      e = embedPoints(new TetGrid(sim), pts);
    });
    When('the mesh is stretched, sheared and moved by an affine map', () => {
      for (let i = 0; i < sim.pos.length; i += 3) sim.pos.set(map(sim.restPos[i], sim.restPos[i + 1], sim.restPos[i + 2]), i);
      moveEmbedded(sim, e.tetId, e.bary, out);
    });
    Then('every embedded point lands where the map sends it', () => {
      for (let i = 0; i < 100; i++) {
        const want = map(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]);
        for (let k = 0; k < 3; k++) expect(Math.abs(out[3 * i + k] - want[k])).toBeLessThan(1e-4);
      }
    });
  });

  Scenario("A piece carries the passengers its source adds", ({ Given, When, Then }) => {
    let piece: Piece, source: ReturnType<typeof sphereSource>;
    Given('a piece source that adds one passenger mesh', () => {
      source = sphereSource(1, (_planes, sim, grid) => {
        const tri = { pos: new Float32Array([0, 0, 0, 0.3, 0, 0, 0, 0.3, 0]), idx: new Uint32Array([0, 1, 2]), isCutFace: new Uint8Array(3) };
        const m = embedMesh(grid, tri, 7, Infinity)!;
        updateSkin(m, sim);
        return [m];
      });
    });
    When('its piece is built', () => { piece = buildPiece(source, [], 0); });
    Then("the piece has that passenger, embedded in the piece's tetrahedra", () => {
      expect(piece.organelles).toHaveLength(1);
      expect(piece.organelles[0].material).toBe(7);
      for (const id of piece.organelles[0].tetId) expect(id).toBeLessThan(piece.sim.tets.length / 4);
    });
  });
});
