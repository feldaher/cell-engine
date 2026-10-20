// From regrow 59d75d4, src/regen/fields.ts (unchanged except imports).
// Reaction–diffusion on the tet mesh (regrow model spec §2; equation check E1). P1 finite elements on
// the CURRENT configuration with lumped mass, backward Euler, Jacobi-preconditioned CG.
// Nodal amounts N = M·c are the conserved quantity: re-assembling after growth keeps N, so
// concentrations dilute by exactly the volume change.

import type { FieldSolver, FieldSpec, SimMesh } from '../contracts';

const CG_TOL = 1e-12;
const CG_MAX = 20000;

export function createFieldSolver(sim: SimMesh): FieldSolver {
  const n = sim.restPos.length / 3;
  // CSR pattern from the mesh edges plus the diagonal.
  const nbr: number[][] = Array.from({ length: n }, (_, i) => [i]);
  for (let e = 0; e < sim.edges.length; e += 2) { nbr[sim.edges[e]].push(sim.edges[e + 1]); nbr[sim.edges[e + 1]].push(sim.edges[e]); }
  const rowPtr = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) { nbr[i].sort((a, b) => a - b); rowPtr[i + 1] = rowPtr[i] + nbr[i].length; }
  const col = new Int32Array(rowPtr[n]);
  for (let i = 0; i < n; i++) col.set(nbr[i], rowPtr[i]);
  const K = new Float64Array(col.length);
  const M = new Float64Array(n);
  const diagK = new Float64Array(n);

  const slot = (i: number, j: number) => {
    let lo = rowPtr[i], hi = rowPtr[i + 1] - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (col[m] < j) lo = m + 1; else if (col[m] > j) hi = m - 1; else return m; }
    throw new Error(`no CSR slot for (${i}, ${j})`);
  };
  const tetSlots = new Int32Array((sim.tets.length / 4) * 16);
  for (let t = 0; t < sim.tets.length / 4; t++)
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) tetSlots[16 * t + 4 * a + b] = slot(sim.tets[4 * t + a], sim.tets[4 * t + b]);

  function assemble(s: SimMesh, carry?: Float64Array[]) {
    const oldM = carry?.length ? M.slice() : null;
    K.fill(0); M.fill(0);
    const x = s.pos, T = s.tets;
    const grad = new Float64Array(12);
    for (let t = 0; t < T.length / 4; t++) {
      const i0 = 3 * T[4 * t], i1 = 3 * T[4 * t + 1], i2 = 3 * T[4 * t + 2], i3 = 3 * T[4 * t + 3];
      const ax = x[i1] - x[i0], ay = x[i1 + 1] - x[i0 + 1], az = x[i1 + 2] - x[i0 + 2];
      const bx = x[i2] - x[i0], by = x[i2 + 1] - x[i0 + 1], bz = x[i2 + 2] - x[i0 + 2];
      const cx = x[i3] - x[i0], cy = x[i3 + 1] - x[i0 + 1], cz = x[i3 + 2] - x[i0 + 2];
      // Rows of [a b c]⁻¹ are the gradients of the barycentric coordinates λ1, λ2, λ3.
      const det = ax * (by * cz - bz * cy) - bx * (ay * cz - az * cy) + cx * (ay * bz - az * by);
      const vol = Math.abs(det) / 6;
      if (vol === 0) continue;
      const s6 = 1 / det;
      grad[3] = (by * cz - bz * cy) * s6; grad[4] = (bz * cx - bx * cz) * s6; grad[5] = (bx * cy - by * cx) * s6;
      grad[6] = (cy * az - cz * ay) * s6; grad[7] = (cz * ax - cx * az) * s6; grad[8] = (cx * ay - cy * ax) * s6;
      grad[9] = (ay * bz - az * by) * s6; grad[10] = (az * bx - ax * bz) * s6; grad[11] = (ax * by - ay * bx) * s6;
      grad[0] = -(grad[3] + grad[6] + grad[9]); grad[1] = -(grad[4] + grad[7] + grad[10]); grad[2] = -(grad[5] + grad[8] + grad[11]);
      for (let a = 0; a < 4; a++) {
        M[T[4 * t + a]] += vol / 4;
        for (let b = 0; b < 4; b++)
          K[tetSlots[16 * t + 4 * a + b]] += vol * (grad[3 * a] * grad[3 * b] + grad[3 * a + 1] * grad[3 * b + 1] + grad[3 * a + 2] * grad[3 * b + 2]);
      }
    }
    for (let i = 0; i < n; i++) diagK[i] = K[slot(i, i)];
    if (oldM) for (const c of carry!) for (let i = 0; i < n; i++) c[i] = M[i] > 0 ? (oldM[i] * c[i]) / M[i] : c[i];
  }

  /** Solve (α M + β K) c = b for the free nodes, with clamped nodes held fixed. c is the warm start. */
  function solve(c: Float64Array, alpha: Float64Array | number, beta: number, b: Float64Array, clamp?: Map<number, number>) {
    const a = (i: number) => (typeof alpha === 'number' ? alpha : alpha[i]);
    const free = new Uint8Array(n).fill(1);
    if (clamp) for (const [i, v] of clamp) { free[i] = 0; c[i] = v; }
    const Ax = (v: Float64Array, out: Float64Array) => {
      for (let i = 0; i < n; i++) {
        let s = a(i) * M[i] * v[i];
        for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) s += beta * K[k] * v[col[k]];
        out[i] = s;
      }
    };
    const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
    const Dinv = new Float64Array(n);
    for (let i = 0; i < n; i++) Dinv[i] = 1 / (a(i) * M[i] + beta * diagK[i]);
    Ax(c, q);
    let bnorm = 0;
    for (let i = 0; i < n; i++) { r[i] = free[i] ? b[i] - q[i] : 0; bnorm += free[i] ? b[i] * b[i] : 0; }
    bnorm = Math.sqrt(bnorm) || 1;
    let rz = 0;
    for (let i = 0; i < n; i++) { z[i] = r[i] * Dinv[i]; p[i] = z[i]; rz += r[i] * z[i]; }
    for (let it = 0; it < CG_MAX; it++) {
      let rn = 0;
      for (let i = 0; i < n; i++) rn += r[i] * r[i];
      if (Math.sqrt(rn) <= CG_TOL * bnorm) return;
      Ax(p, q);
      let pq = 0;
      for (let i = 0; i < n; i++) { if (!free[i]) q[i] = 0; pq += p[i] * q[i]; }
      const alph = rz / pq;
      let rz2 = 0;
      for (let i = 0; i < n; i++) {
        c[i] += alph * p[i]; r[i] -= alph * q[i];
        z[i] = r[i] * Dinv[i]; rz2 += r[i] * z[i];
      }
      const bet = rz2 / rz; rz = rz2;
      for (let i = 0; i < n; i++) p[i] = free[i] ? z[i] + bet * p[i] : 0;
    }
    throw new Error('field solve did not converge');
  }

  return {
    nNodes: n,
    assemble,
    mass: () => M,
    step(c, spec: FieldSpec, dt, source, clamp) {
      // (M + Δt(D K + k M)) cⁿ⁺¹ = M cⁿ + Δt S
      const b = new Float64Array(n);
      for (let i = 0; i < n; i++) b[i] = M[i] * c[i] + (source ? dt * source[i] : 0);
      solve(c, 1 + dt * spec.k, dt * spec.D, b, clamp);
    },
    steady(c, spec: FieldSpec, source, clamp, decay) {
      const b = source ? Float64Array.from(source) : new Float64Array(n);
      solve(c, decay ?? spec.k, spec.D, b, clamp);
    },
  };
}
