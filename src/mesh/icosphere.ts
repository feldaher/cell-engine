// A closed, manifold triangle sphere by subdividing an icosahedron. Unlike a surface extracted
// from a signed distance field, its topology is known: every edge is shared by exactly two
// triangles, which is what a volume constraint (physics/cavity) and a membrane need.

import type { Vec3 } from '../contracts';

export interface TriMesh {
  pos: Float32Array;
  tris: Uint32Array;
}

const T = (1 + Math.sqrt(5)) / 2;
const BASE_V: number[][] = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
  [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
  [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
];
const BASE_F: number[][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/**
 * An icosphere of radius `r` at `centre`, subdivided `depth` times: 20·4^depth triangles and
 * 10·4^depth + 2 vertices, wound outward.
 */
export function icosphere(centre: Vec3 = [0, 0, 0], r = 1, depth = 2): TriMesh {
  let verts = BASE_V.map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = BASE_F.map((f) => [...f]);
  for (let d = 0; d < depth; d++) {
    const mid = new Map<number, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? a * 2 ** 26 + b : b * 2 ** 26 + a;
      let m = mid.get(key);
      if (m === undefined) {
        const p = [verts[a][0] + verts[b][0], verts[a][1] + verts[b][1], verts[a][2] + verts[b][2]];
        const l = Math.hypot(p[0], p[1], p[2]);
        m = verts.length;
        verts.push([p[0] / l, p[1] / l, p[2] / l]);
        mid.set(key, m);
      }
      return m;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => {
    pos[3 * i] = centre[0] + r * v[0];
    pos[3 * i + 1] = centre[1] + r * v[1];
    pos[3 * i + 2] = centre[2] + r * v[2];
  });
  return { pos, tris: Uint32Array.from(faces.flat()) };
}

/** The subdivision depth whose edges come closest to `spacing` on a sphere of radius `r`. */
export function icosphereDepth(r: number, spacing: number): number {
  // Edge length of a depth-d icosphere is about 1.0515·r / 2^d (the icosahedron's edge is 1.0515 r).
  let best = 0, bestErr = Infinity;
  for (let d = 0; d <= 6; d++) {
    const err = Math.abs((1.0515 * r) / 2 ** d - spacing);
    if (err < bestErr) { bestErr = err; best = d; }
  }
  return best;
}

/** Merges meshes into one, offsetting indices. */
export function mergeTriMeshes(parts: TriMesh[]): TriMesh {
  const nv = parts.reduce((s, p) => s + p.pos.length, 0);
  const nt = parts.reduce((s, p) => s + p.tris.length, 0);
  const pos = new Float32Array(nv), tris = new Uint32Array(nt);
  let vo = 0, to = 0;
  for (const p of parts) {
    pos.set(p.pos, vo);
    for (let i = 0; i < p.tris.length; i++) tris[to + i] = p.tris[i] + vo / 3;
    vo += p.pos.length; to += p.tris.length;
  }
  return { pos, tris };
}

/**
 * How much of the ideal sphere's volume a depth-`depth` icosphere of radius 1 actually encloses.
 * It is inscribed, so always less: about 0.874, 0.966, 0.991, 0.998 for depths 1 to 4. Anyone
 * who needs a bubble of a given volume has to allow for it, which `icosphereForVolume` does.
 */
export function icosphereVolumeFactor(depth: number): number {
  let f = FACTORS.get(depth);
  if (f === undefined) {
    const m = icosphere([0, 0, 0], 1, depth);
    let v = 0;
    for (let t = 0; t < m.tris.length; t += 3) {
      const a = 3 * m.tris[t], b = 3 * m.tris[t + 1], c = 3 * m.tris[t + 2];
      v += m.pos[a] * (m.pos[b + 1] * m.pos[c + 2] - m.pos[b + 2] * m.pos[c + 1])
         + m.pos[a + 1] * (m.pos[b + 2] * m.pos[c] - m.pos[b] * m.pos[c + 2])
         + m.pos[a + 2] * (m.pos[b] * m.pos[c + 1] - m.pos[b + 1] * m.pos[c]);
    }
    f = v / 6 / ((4 / 3) * Math.PI);
    FACTORS.set(depth, f);
  }
  return f;
}
const FACTORS = new Map<number, number>();

/** An icosphere whose mesh encloses exactly `volume`, not one whose ideal sphere would. */
export function icosphereForVolume(centre: Vec3, volume: number, depth: number): TriMesh {
  const r = Math.cbrt(volume / (((4 / 3) * Math.PI) * icosphereVolumeFactor(depth)));
  return icosphere(centre, r, depth);
}
