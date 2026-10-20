import { Prim, type Piece, type PieceSource, type Plane, type Shape, type SimMesh, type SimParams, type Vec3 } from '../src/contracts';
import { planeDist, primSdf } from '../src/sdf/primitives';
import { buildSimMesh } from '../src/mesh/tetgen';
import { buildPiece } from '../src/mesh/piece';
import { defaultParams } from '../src/physics/params';
import { step } from '../src/physics/xpbd';

type MaterialFn = (x: number, y: number, z: number) => number;

/** A sphere of radius r at the origin, cut by `planes`. */
export function sphereShape(r = 1, planes: Plane[] = [], material: MaterialFn = () => 0): Shape {
  const ball = { kind: Prim.Ellipsoid, material: 0, a: [0, 0, 0] as Vec3, b: [r, r, r] as Vec3, R: 0, r: 0 };
  const uncut = (x: number, y: number, z: number) => primSdf(ball, x, y, z);
  return {
    sdf: (x, y, z) => planes.reduce((d, pl) => Math.max(d, planeDist(pl, x, y, z)), uncut(x, y, z)),
    uncut,
    planes,
    material,
    bounds: { lo: [-r, -r, -r], hi: [r, r, r] },
    mesh: { minSpacing: 0.16 * r, maxSpacing: 0.25 * r, minParticles: 300, skinGrid: 0.08 * r },
  };
}

export function sphereSource(r = 1, organelles?: PieceSource['organelles']): PieceSource {
  return { shape: (planes) => sphereShape(r, planes), skinMaterial: 0, organelles };
}

/** A capsule from a to b (radius r), meshed at spacing h. */
export function capsuleMesh(a: Vec3, b: Vec3, r: number, h: number): SimMesh {
  const cap = { kind: Prim.Capsule, material: 0, a, b, R: r, r };
  const f = (x: number, y: number, z: number) => primSdf(cap, x, y, z);
  return buildSimMesh({
    sdf: f, uncut: f, planes: [], material: () => 0,
    bounds: { lo: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r], hi: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r] },
    mesh: { minSpacing: h, maxSpacing: h, minParticles: 100, skinGrid: h },
  }, h);
}

/** A long bar along +x from 0 to `len`, radius 1. */
export const bar = (len = 24, h = 0.35) => capsuleMesh([0, 0, 0], [len, 0, 0], 1, h);

export function spherePiece(lift = 0, r = 1): Piece {
  const p = buildPiece(sphereSource(r), [], 0);
  placeOnFloor(p, lift);
  return p;
}

export function placeOnFloor(p: Piece, lift: number) {
  const s = p.sim;
  let minY = Infinity;
  for (let i = 1; i < s.pos.length; i += 3) minY = Math.min(minY, s.pos[i]);
  for (let i = 1; i < s.pos.length; i += 3) { s.pos[i] += lift - minY + 1e-3; s.prevPos[i] = s.pos[i]; }
}

export function simulate(pieces: Piece[], seconds: number, params: SimParams = defaultParams(), extra?: Parameters<typeof step>[3]) {
  for (let f = 0, n = Math.round(seconds * 60); f < n; f++) step(pieces, params, 1 / 60, extra);
}

export function sum(a: ArrayLike<number>, w?: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += w ? a[i] * w[i] : a[i];
  return s;
}

export function meanVelocity(s: SimMesh): Vec3 {
  const v: Vec3 = [0, 0, 0];
  let m = 0;
  for (let i = 0; i < s.invMass.length; i++) {
    const w = s.invMass[i] > 0 ? 1 / s.invMass[i] : 0;
    m += w;
    for (let k = 0; k < 3; k++) v[k] += w * s.vel[3 * i + k];
  }
  return [v[0] / m, v[1] / m, v[2] / m];
}

/** Unit cube [0,1]³ as 12 outward-wound triangles over 8 corner particles. */
export function unitCube(): { pos: Float32Array; tris: Uint32Array } {
  const pos = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1]);
  const q = (a: number, b: number, c: number, d: number) => [a, b, c, a, c, d];
  const tris = Uint32Array.from([
    ...q(0, 3, 2, 1),   // z = 0, outward -z
    ...q(4, 5, 6, 7),   // z = 1, outward +z
    ...q(0, 1, 5, 4),   // y = 0
    ...q(2, 3, 7, 6),   // y = 1
    ...q(0, 4, 7, 3),   // x = 0
    ...q(1, 2, 6, 5),   // x = 1
  ]);
  return { pos, tris };
}

/** A flat square sheet of side `side` in the z = 0 plane, as a triangulated grid of `n`×`n` cells. */
export function flatSheet(side = 10, n = 20): { pos: Float32Array; tris: Uint32Array } {
  const h = side / n, m = n + 1;
  const pos = new Float32Array(m * m * 3);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const v = 3 * (i + m * j);
    pos[v] = i * h; pos[v + 1] = j * h; pos[v + 2] = 0;
  }
  const tris: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = i + m * j, b = a + 1, c = a + m, d = c + 1;
    tris.push(a, b, d, a, d, c);
  }
  return { pos, tris: Uint32Array.from(tris) };
}

/** A long flat strip along +x, `len` by `width`, triangulated at about `h` spacing. */
export function flatStrip(len = 24, width = 1, h = 0.35): { pos: Float32Array; tris: Uint32Array } {
  const nx = Math.round(len / h), ny = Math.max(1, Math.round(width / h));
  const mx = nx + 1, my = ny + 1;
  const pos = new Float32Array(mx * my * 3);
  for (let j = 0; j < my; j++) for (let i = 0; i < mx; i++) {
    const v = 3 * (i + mx * j);
    pos[v] = (i / nx) * len; pos[v + 1] = (j / ny) * width; pos[v + 2] = 0;
  }
  const tris: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = i + mx * j, b = a + 1, c = a + mx, d = c + 1;
    tris.push(a, b, d, a, d, c);
  }
  return { pos, tris: Uint32Array.from(tris) };
}
