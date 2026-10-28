// The SDF primitives the shaders cut sections through, packed for a storage buffer, and the
// hidden-material mask.

import { PRIM_STRIDE, type Primitive } from '../contracts';

/** A part of the body: combined with the parts before it by smooth union, subtraction, or a morph. */
export interface BodyPart { prim: Primitive; op: 'union' | 'subtract' | 'morph'; blend: number }

const OP_CODE = { union: 0, subtract: 1, morph: 2 } as const;

/** Body parts first, then organelles: [kind, material, R, r, a.xyz, op, b.xyz, blend] each. */
export function packPrimitives(body: BodyPart[], organelles: Primitive[]): Float32Array {
  const all = [...body.map((b) => ({ p: b.prim, op: OP_CODE[b.op], blend: b.blend })), ...organelles.map((p) => ({ p, op: 0, blend: 0 }))];
  const out = new Float32Array(all.length * PRIM_STRIDE);
  all.forEach(({ p, op, blend }, i) => {
    const b = i * PRIM_STRIDE;
    out[b] = p.kind; out[b + 1] = p.material; out[b + 2] = p.R; out[b + 3] = p.r;
    out.set(p.a, b + 4); out[b + 7] = op;
    out.set(p.b, b + 8); out[b + 11] = blend;
  });
  return out;
}

/** The mask travels in a float uniform, which holds integers exactly only below 2^24. */
export const MAX_MASKED_MATERIAL = 23;

export function hiddenMask(materials: number[]): number {
  let mask = 0;
  for (const m of materials) {
    if (!Number.isInteger(m) || m < 0 || m > MAX_MASKED_MATERIAL) throw new Error(`hiddenMask: material ${m} is outside 0–${MAX_MASKED_MATERIAL}`);
    mask |= 1 << m;
  }
  return mask >>> 0;
}

export function isHiddenIn(mask: number, m: number): boolean { return ((mask >>> m) & 1) === 1; }
