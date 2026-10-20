// An enclosed volume held to a target: the constraint that makes a hollow body breathe.
// C = V(x) − target over a closed, outward-wound triangle surface of the simulation particles.
// Breath's model spec, equations E1, E2 and E4.

/** Anything with particles the constraint can move: a SimMesh or a Membrane. */
export interface CavityBody {
  pos: Float32Array;
  /** 0 for a particle held in place. */
  invMass: Float32Array;
}

export interface Cavity {
  /** A CLOSED surface over the body's particles, wound outward: 3 particle indices per triangle. */
  tris: Uint32Array;
  /** The volume the cavity is pulled toward (sim units³). */
  target: number;
  /** XPBD compliance; 0 is rigid, larger is softer. Units: (sim units³)² per unit energy. */
  compliance: number;
  /**
   * Lagrange multiplier left by the last substep. The pressure the cavity exerts is
   * `lambda / h²` with `h` that substep (XPBD folds a Δt² into λ), positive when the cavity
   * pushes its wall outward.
   */
  lambda: number;
}

/**
 * Volume enclosed by a closed, outward-wound triangle surface (the divergence theorem for ∇·x = 3):
 * V = (1/6) Σ x_i · (x_j × x_k). Translation-invariant only because the surface is closed.
 */
export function cavityVolume(pos: Float32Array, tris: Uint32Array): number {
  let v = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
       + pos[a + 1] * (pos[b + 2] * pos[c] - pos[b] * pos[c + 2])
       + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return v / 6;
}

const scratch = new WeakMap<Cavity, Float64Array>();

/**
 * One XPBD solve of each cavity, to be called inside a substep (as the `constrain` hook of
 * physics/soft or physics/membrane, or alongside the other constraints of physics/xpbd).
 * `h` is the substep length.
 * Each call starts from λ = 0, as XPBD does within a substep.
 */
export function solveCavities(body: CavityBody, cavities: Cavity[], h: number): void {
  const x = body.pos, w = body.invMass;
  const n = w.length;
  for (const cav of cavities) {
    let g = scratch.get(cav);
    if (!g || g.length !== 3 * n) { g = new Float64Array(3 * n); scratch.set(cav, g); }
    else g.fill(0);
    // ∂V/∂x_i = (1/6) Σ_{triangles at i} x_j × x_k
    const tris = cav.tris;
    for (let t = 0; t < tris.length; t += 3) {
      const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
      const a = 3 * ia, b = 3 * ib, c = 3 * ic;
      g[a] += (x[b + 1] * x[c + 2] - x[b + 2] * x[c + 1]) / 6;
      g[a + 1] += (x[b + 2] * x[c] - x[b] * x[c + 2]) / 6;
      g[a + 2] += (x[b] * x[c + 1] - x[b + 1] * x[c]) / 6;
      g[b] += (x[c + 1] * x[a + 2] - x[c + 2] * x[a + 1]) / 6;
      g[b + 1] += (x[c + 2] * x[a] - x[c] * x[a + 2]) / 6;
      g[b + 2] += (x[c] * x[a + 1] - x[c + 1] * x[a]) / 6;
      g[c] += (x[a + 1] * x[b + 2] - x[a + 2] * x[b + 1]) / 6;
      g[c + 1] += (x[a + 2] * x[b] - x[a] * x[b + 2]) / 6;
      g[c + 2] += (x[a] * x[b + 1] - x[a + 1] * x[b]) / 6;
    }
    const C = cavityVolume(x, tris) - cav.target;
    const alpha = cav.compliance / (h * h);
    let denom = alpha;
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      const j = 3 * i;
      denom += w[i] * (g[j] * g[j] + g[j + 1] * g[j + 1] + g[j + 2] * g[j + 2]);
    }
    if (denom < 1e-20) { cav.lambda = 0; continue; }
    const dl = -C / denom;
    cav.lambda = dl;
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      const j = 3 * i;
      x[j] += w[i] * dl * g[j];
      x[j + 1] += w[i] * dl * g[j + 1];
      x[j + 2] += w[i] * dl * g[j + 2];
    }
  }
}

/** The pressure a cavity exerted in the last substep of length `h`, in sim units. */
export function cavityPressure(cav: Cavity, h: number): number {
  return cav.lambda / (h * h);
}
