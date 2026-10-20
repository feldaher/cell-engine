// From regrow 59d75d4, src/regen/fields.ts (the tet path is unchanged; triangles added for
// Breath, which runs its fields on a surface).
// Reaction–diffusion by P1 finite elements on the CURRENT configuration, with lumped mass,
// backward Euler and Jacobi-preconditioned CG. Elements are tetrahedra in a volume or triangles
// on a surface (where the operator is the Laplace–Beltrami one).
// Nodal amounts N = M·c are the conserved quantity: re-assembling after the mesh moves keeps N,
// so concentrations dilute by exactly the volume (or area) change.

import type { FieldSolver, FieldSpec, SimMesh } from '../contracts';

const CG_TOL = 1e-12;
const CG_MAX = 20000;

/** A triangle mesh the fields live on: flat xyz positions and 3 node indices per triangle. */
export interface SurfaceMesh {
  pos: Float32Array;
  tris: Uint32Array;
}

/** Reaction–diffusion in the volume of a tetrahedral mesh. */
export function createFieldSolver(sim: SimMesh): FieldSolver {
  return createFemSolver(sim.restPos.length / 3, 4, sim.tets);
}

/**
 * Reaction–diffusion over a triangulated surface (Laplace–Beltrami). `assemble` takes the surface
 * with its current positions, exactly as the tet solver takes the sim mesh.
 */
export function createSurfaceFieldSolver(surf: SurfaceMesh): FieldSolver {
  return createFemSolver(surf.pos.length / 3, 3, surf.tris);
}

function createFemSolver(n: number, perElement: 3 | 4, elements: Uint32Array): FieldSolver {
  const nE = elements.length / perElement;
  // CSR pattern: every pair of nodes that share an element, plus the diagonal.
  const nbr: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const seen = new Set<number>();
  for (let e = 0; e < nE; e++)
    for (let a = 0; a < perElement; a++) for (let b = a + 1; b < perElement; b++) {
      const i = elements[perElement * e + a], j = elements[perElement * e + b];
      const key = i < j ? i * n + j : j * n + i;
      if (seen.has(key)) continue;
      seen.add(key);
      nbr[i].push(j); nbr[j].push(i);
    }
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
  const P2 = perElement * perElement;
  const slots = new Int32Array(nE * P2);
  for (let e = 0; e < nE; e++)
    for (let a = 0; a < perElement; a++) for (let b = 0; b < perElement; b++)
      slots[P2 * e + perElement * a + b] = slot(elements[perElement * e + a], elements[perElement * e + b]);

  function assemble(s: { pos: Float32Array }, carry?: Float64Array[]) {
    const oldM = carry?.length ? M.slice() : null;
    K.fill(0); M.fill(0);
    const x = s.pos, T = elements;
    const grad = new Float64Array(12);
    if (perElement === 4) for (let t = 0; t < nE; t++) {
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
          K[slots[16 * t + 4 * a + b]] += vol * (grad[3 * a] * grad[3 * b] + grad[3 * a + 1] * grad[3 * b + 1] + grad[3 * a + 2] * grad[3 * b + 2]);
      }
    }
    else for (let t = 0; t < nE; t++) {
      // P1 on a triangle in space. ∇λ is in the triangle's plane, perpendicular to the opposite
      // edge, of length 1/(height from that node): ∇λ_a = n̂ × (opposite edge, wound forward) / 2A.
      const i0 = 3 * T[3 * t], i1 = 3 * T[3 * t + 1], i2 = 3 * T[3 * t + 2];
      const ax = x[i1] - x[i0], ay = x[i1 + 1] - x[i0 + 1], az = x[i1 + 2] - x[i0 + 2];
      const bx = x[i2] - x[i0], by = x[i2 + 1] - x[i0 + 1], bz = x[i2 + 2] - x[i0 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const twoA = Math.hypot(nx, ny, nz);
      if (twoA === 0) continue;
      const area = twoA / 2;
      const ux = nx / twoA, uy = ny / twoA, uz = nz / twoA;   // unit normal
      // edges opposite to nodes 0, 1, 2: (p2 − p1), (p0 − p2), (p1 − p0)
      const ex = [bx - ax, -bx, ax], ey = [by - ay, -by, ay], ez = [bz - az, -bz, az];
      const inv = 1 / twoA;
      for (let a = 0; a < 3; a++) {
        grad[3 * a] = (uy * ez[a] - uz * ey[a]) * inv;
        grad[3 * a + 1] = (uz * ex[a] - ux * ez[a]) * inv;
        grad[3 * a + 2] = (ux * ey[a] - uy * ex[a]) * inv;
      }
      for (let a = 0; a < 3; a++) {
        M[T[3 * t + a]] += area / 3;
        for (let b = 0; b < 3; b++)
          K[slots[9 * t + 3 * a + b]] += area * (grad[3 * a] * grad[3 * b] + grad[3 * a + 1] * grad[3 * b + 1] + grad[3 * a + 2] * grad[3 * b + 2]);
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
    // A node that belongs to no element (an interior particle when the elements are a surface)
    // has an empty row: hold it where it is rather than dividing by zero.
    const Dinv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const d = a(i) * M[i] + beta * diagK[i];
      if (d > 0) Dinv[i] = 1 / d; else free[i] = 0;
    }
    const Ax = (v: Float64Array, out: Float64Array) => {
      for (let i = 0; i < n; i++) {
        let s = a(i) * M[i] * v[i];
        for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) s += beta * K[k] * v[col[k]];
        out[i] = s;
      }
    };
    const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
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
