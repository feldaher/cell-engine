// The surface of a tetrahedral mesh, as triangles over its own particles. Unlike the render skin
// (mesh/surface), these triangles index simulation particles, so constraints can act on them.

import type { SimMesh } from '../contracts';

/** The four faces of a positively oriented tet, each wound so its normal points out of the tet. */
const FACES = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];

/**
 * Triangles used by exactly one tetrahedron: the boundary of the mesh, wound outward.
 * 3 particle indices per triangle.
 */
export function boundaryFaces(sim: SimMesh): Uint32Array {
  const T = sim.tets, nt = T.length / 4;
  const count = new Map<string, number>();
  const key = (a: number, b: number, c: number) => {
    const s = [a, b, c].sort((x, y) => x - y);
    return `${s[0]},${s[1]},${s[2]}`;
  };
  for (let t = 0; t < nt; t++)
    for (const f of FACES) {
      const k = key(T[4 * t + f[0]], T[4 * t + f[1]], T[4 * t + f[2]]);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  const out: number[] = [];
  for (let t = 0; t < nt; t++)
    for (const f of FACES) {
      const a = T[4 * t + f[0]], b = T[4 * t + f[1]], c = T[4 * t + f[2]];
      if (count.get(key(a, b, c)) === 1) out.push(a, b, c);
    }
  return Uint32Array.from(out);
}
