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
 * Triangles that close the open rims of a surface, so that it encloses a volume. Every boundary
 * edge is reversed (in a closed, consistently wound mesh each edge appears once in each
 * direction) and the rims are walked into closed loops, each fanned from its own first vertex.
 *
 * The apex of a fan has to lie on the rim it closes: fanning a hole from anywhere else makes a
 * cone or a tube that leaves the mesh open where the fan meets the surface.
 *
 * A rim need not be a simple loop. Where a region of a mesh is carved out by some other rule —
 * which alveolus a face is nearest, say — its boundary can pinch, visiting a vertex twice. The
 * walk then splits there into several closed loops and each is capped on its own, which still
 * closes the surface. The cap of such a rim is only as good a surface as the rim is flat, but
 * the enclosed volume is exact for whatever closed surface comes out.
 */
export function capBoundary(tris: Uint32Array): Uint32Array {
  // Edges used once, keeping their direction.
  const once = new Map<number, [number, number]>();
  const key = (a: number, b: number) => (a < b ? a * 2 ** 26 + b : b * 2 ** 26 + a);
  for (let t = 0; t < tris.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)], k = key(a, b);
      if (once.has(k)) once.delete(k); else once.set(k, [a, b]);
    }
  // Out-edges per vertex. On the boundary of an oriented surface every vertex has as many
  // leaving as arriving, so the edges split into closed walks.
  const out = new Map<number, number[]>();
  for (const [a, b] of once.values()) {
    const list = out.get(a);
    if (list) list.push(b); else out.set(a, [b]);
  }
  const caps: number[] = [];
  for (const start of [...out.keys()]) {
    for (;;) {
      const first = out.get(start);
      if (!first || first.length === 0) break;
      // Walk from `start` until we come back to it, fanning as we go.
      let a = first.pop()!;
      while (a !== start) {
        const nexts = out.get(a);
        if (!nexts || nexts.length === 0) throw new Error(`the rim is not closed: no edge leaves vertex ${a}`);
        const b = nexts.pop()!;
        // The edge that closes the walk would make a degenerate triangle at the apex, and the
        // rim edge itself already pairs with the fan's last edge.
        if (b !== start) caps.push(start, b, a);
        a = b;
      }
    }
  }
  return Uint32Array.from(caps);
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
