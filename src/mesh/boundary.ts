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

/**
 * Triangles that close the open rims of a surface, so that it encloses a volume. Each rim is
 * walked as a loop and fanned from its own first vertex, with every boundary edge reversed: in a
 * closed, consistently wound mesh each edge appears once in each direction.
 *
 * The apex has to be a vertex of the rim it closes. Fanning a hole from anywhere else makes a
 * cone or a tube that leaves the mesh open where the fan meets the surface.
 */
export function capBoundary(tris: Uint32Array): Uint32Array {
  // Edges used once, kept with their direction. `next` chains them into loops.
  const once = new Map<number, [number, number]>();
  const key = (a: number, b: number) => (a < b ? a * 2 ** 26 + b : b * 2 ** 26 + a);
  for (let t = 0; t < tris.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)], k = key(a, b);
      if (once.has(k)) once.delete(k); else once.set(k, [a, b]);
    }
  const next = new Map<number, number>();
  for (const [a, b] of once.values()) {
    if (next.has(a)) throw new Error(`vertex ${a} starts two boundary edges: the rim is not a simple loop`);
    next.set(a, b);
  }
  const out: number[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    // Walk this rim loop from `start`, fanning it from `start` as we go.
    let a = next.get(start)!;
    seen.add(start);
    while (a !== start) {
      const b = next.get(a);
      if (b === undefined) throw new Error(`boundary edge from ${a} is missing: the rim is not closed`);
      seen.add(a);
      if (a !== start && b !== start) out.push(start, b, a);
      a = b;
    }
  }
  return Uint32Array.from(out);
}

/** Whether every edge of a triangle soup is used by exactly two triangles. */
export function isClosed(tris: Uint32Array): boolean {
  const count = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * 2 ** 26 + b : b * 2 ** 26 + a);
  for (let t = 0; t < tris.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const k = key(tris[t + e], tris[t + ((e + 1) % 3)]);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  for (const c of count.values()) if (c !== 2) return false;
  return true;
}
