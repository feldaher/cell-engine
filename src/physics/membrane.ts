// A thin sheet of tissue as what it is: a surface, not a solid. XPBD on a triangle mesh with
// in-plane stretch along the edges and resistance to bending across them. Together with
// physics/cavity this makes a closed membrane that can be inflated and deflated — an alveolus.
//
// Why not tetrahedra: a septum about 12 µm across a 100 µm alveolus is a membrane, and meshing
// it as a solid costs tets as 1/thickness². Measured for one acinus: 119,000 tetrahedra and
// 97 ms a step, against 10,000 surface nodes here
// (breath/outputs/design/2026-10-20_architecture.md, "Measured 2026-10-20").
//
// Substep independence: as in physics/soft, the compliance term α/h² of every constraint must
// dominate the particles' inertia, so that what the sheet settles to does not depend on how many
// substeps were used. `softness` sets that ratio.

import type { Vec3 } from '../contracts';
import type { TriMesh } from '../mesh/icosphere';

export interface Membrane {
  pos: Float32Array;
  prevPos: Float32Array;
  vel: Float32Array;
  /** 0 for a node held in place. */
  invMass: Float32Array;
  tris: Uint32Array;
  /** Unique edges, 2 node indices each. */
  edges: Uint32Array;
  /** Rest length of each edge. */
  restLen: Float32Array;
  /**
   * Fold-resistance pairs: for each interior edge, the two nodes opposite it, and their rest
   * distance. Keeping that distance resists folding without resisting stretch, which the edges
   * already handle.
   *
   * It is deliberately a weak, SECOND-ORDER resistance: rolling a sheet to curvature κ shortens
   * the pair by only about d³κ²/24, so even a very stiff setting brings a rolled sheet back
   * about a fifth of the way (measured in features/membrane.feature). That suits an alveolus,
   * which has to crumple when it collapses; it is not plate bending, and anything needing a
   * first-order response wants a dihedral-angle or quadratic-bending constraint instead.
   */
  bendPairs: Uint32Array;
  bendRest: Float32Array;
  /** Rest area of each triangle, for reporting and for area-weighted quantities. */
  restArea: Float32Array;
  /** Mean rest edge length; the mesh's spacing. */
  spacing: number;
}

export interface MembraneParams {
  substeps: number;
  /** ρ·spacing²/(k·h²) for the stretch constraint; 100 or more keeps it substep-independent. */
  softness: number;
  /** Fold resistance over stretch stiffness. See Membrane.bendPairs: the response is weak. */
  bendRatio: number;
  /** Rate (1/s) at which relative motion along edges dies away. */
  damping: number;
}

/** Builds a membrane from a closed (or open) triangle mesh, with mass spread over the triangles. */
export function makeMembrane(mesh: TriMesh, density = 1): Membrane {
  const n = mesh.pos.length / 3;
  const pos = Float32Array.from(mesh.pos);
  const tris = Uint32Array.from(mesh.tris);
  const mass = new Float64Array(n);
  const restArea = new Float32Array(tris.length / 3);
  for (let t = 0; t < tris.length; t += 3) {
    const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const area = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    restArea[t / 3] = area;
    for (let k = 0; k < 3; k++) mass[tris[t + k]] += (density * area) / 3;
  }

  // Edges, and the triangles on each side of them.
  const sides = new Map<number, number[]>();
  const key = (a: number, b: number) => (a < b ? a * 2 ** 26 + b : b * 2 ** 26 + a);
  for (let t = 0; t < tris.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)], k = key(a, b);
      const opposite = tris[t + ((e + 2) % 3)];
      const s = sides.get(k);
      if (s) s.push(opposite); else sides.set(k, [opposite]);
    }
  const edges: number[] = [], restLen: number[] = [], bendPairs: number[] = [], bendRest: number[] = [];
  const dist = (i: number, j: number) => Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
  for (const [k, opp] of sides) {
    const a = Math.floor(k / 2 ** 26), b = k % 2 ** 26;
    edges.push(a, b); restLen.push(dist(a, b));
    if (opp.length === 2) { bendPairs.push(opp[0], opp[1]); bendRest.push(dist(opp[0], opp[1])); }
  }
  const spacing = restLen.reduce((s, l) => s + l, 0) / restLen.length;

  return {
    pos,
    prevPos: Float32Array.from(pos),
    vel: new Float32Array(n * 3),
    invMass: Float32Array.from(mass, (m) => (m > 0 ? 1 / m : 0)),
    tris,
    edges: Uint32Array.from(edges),
    restLen: Float32Array.from(restLen),
    bendPairs: Uint32Array.from(bendPairs),
    bendRest: Float32Array.from(bendRest),
    restArea,
    spacing,
  };
}

/** The stretch stiffness the solver is using at these settings and this frame time. */
export function stretchStiffness(m: Membrane, p: MembraneParams, dt: number): number {
  const h = dt / p.substeps;
  return (m.spacing * m.spacing) / (p.softness * h * h);
}

/**
 * Advances the membrane by `dt`. `constrain` runs every substep after the elastic solve, with the
 * substep length, for anything else that moves nodes — the cavity constraint, a hand, a tether.
 */
export function step(m: Membrane, p: MembraneParams, dt: number, constrain?: (h: number) => void): void {
  const n = p.substeps, h = dt / n;
  const k = stretchStiffness(m, p, dt);
  const alphaStretch = 1 / (k * h * h);
  const alphaBend = 1 / (k * p.bendRatio * h * h);
  const kDamp = 1 - Math.exp(-p.damping * h);
  for (let s = 0; s < n; s++) {
    predict(m, h);
    solveDistances(m, m.edges, m.restLen, alphaStretch);
    if (m.bendPairs.length) solveDistances(m, m.bendPairs, m.bendRest, alphaBend);
    constrain?.(h);
    updateVelocity(m, h);
    dampEdges(m, kDamp);
  }
}

function predict(m: Membrane, h: number) {
  const { pos, prevPos, vel, invMass } = m;
  for (let i = 0, n = invMass.length; i < n; i++) {
    const j = 3 * i;
    prevPos[j] = pos[j]; prevPos[j + 1] = pos[j + 1]; prevPos[j + 2] = pos[j + 2];
    if (invMass[i] === 0) continue;
    pos[j] += vel[j] * h; pos[j + 1] += vel[j + 1] * h; pos[j + 2] += vel[j + 2] * h;
  }
}

/** One Gauss–Seidel pass of XPBD distance constraints with a shared compliance. */
function solveDistances(m: Membrane, pairs: Uint32Array, rest: Float32Array, alpha: number) {
  const x = m.pos, w = m.invMass;
  for (let e = 0, p = 0; e < pairs.length; e += 2, p++) {
    const a = pairs[e], b = pairs[e + 1];
    const wa = w[a], wb = w[b], ws = wa + wb;
    if (ws === 0) continue;
    const A = 3 * a, B = 3 * b;
    let dx = x[B] - x[A], dy = x[B + 1] - x[A + 1], dz = x[B + 2] - x[A + 2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-12) continue;
    dx /= l; dy /= l; dz /= l;
    const C = l - rest[p];
    const dl = -C / (ws + alpha);
    x[A] -= wa * dl * dx; x[A + 1] -= wa * dl * dy; x[A + 2] -= wa * dl * dz;
    x[B] += wb * dl * dx; x[B + 1] += wb * dl * dy; x[B + 2] += wb * dl * dz;
  }
}

function updateVelocity(m: Membrane, h: number) {
  const { pos, prevPos, vel } = m, inv = 1 / h;
  for (let j = 0, n = pos.length; j < n; j++) vel[j] = (pos[j] - prevPos[j]) * inv;
}

function dampEdges(m: Membrane, k: number) {
  const { pos, vel, invMass, edges } = m;
  for (let e = 0, n = edges.length; e < n; e += 2) {
    const a = edges[e], b = edges[e + 1];
    const wa = invMass[a], wb = invMass[b], ws = wa + wb;
    if (ws === 0) continue;
    const A = 3 * a, B = 3 * b;
    let nx = pos[B] - pos[A], ny = pos[B + 1] - pos[A + 1], nz = pos[B + 2] - pos[A + 2];
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    const vr = (vel[B] - vel[A]) * nx + (vel[B + 1] - vel[A + 1]) * ny + (vel[B + 2] - vel[A + 2]) * nz;
    const d = (k * vr) / ws;
    vel[A] += wa * d * nx; vel[A + 1] += wa * d * ny; vel[A + 2] += wa * d * nz;
    vel[B] -= wb * d * nx; vel[B + 1] -= wb * d * ny; vel[B + 2] -= wb * d * nz;
  }
}

/** Total current area of the sheet. */
export function membraneArea(m: Membrane): number {
  let a = 0;
  const { pos, tris } = m;
  for (let t = 0; t < tris.length; t += 3) {
    const i = 3 * tris[t], j = 3 * tris[t + 1], k = 3 * tris[t + 2];
    const ux = pos[j] - pos[i], uy = pos[j + 1] - pos[i + 1], uz = pos[j + 2] - pos[i + 2];
    const wx = pos[k] - pos[i], wy = pos[k + 1] - pos[i + 1], wz = pos[k + 2] - pos[i + 2];
    a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return a;
}

/** Centre of mass of the membrane. */
export function membraneCentre(m: Membrane): Vec3 {
  const c: Vec3 = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < m.invMass.length; i++) {
    const mass = m.invMass[i] > 0 ? 1 / m.invMass[i] : 0;
    total += mass;
    for (let k = 0; k < 3; k++) c[k] += mass * m.pos[3 * i + k];
  }
  return [c[0] / total, c[1] / total, c[2] / total];
}
