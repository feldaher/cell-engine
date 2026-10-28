// A "variety": one way of looking at a body (brightfield, fluorescence, a reporter...). Colours
// are sRGB hex; the palette is packed linear, in the vec4 slots the shaders read (common.wgsl).

import type { MaterialId, Vec3 } from '../contracts';

export interface Variety {
  id: string;
  name: string;
  /** Page / floor colour. */
  background: string;
  ink: string;
  /** Beer–Lambert absorption per unit of jelly, rgb. */
  absorb: Vec3;
  /** In-scattering colour of the jelly (material 0); also the colour of any material without its own. */
  scatter: string;
  scatterDensity: number;
  colors: Partial<Record<MaterialId, string>>;
  membrane: string;
  membraneStrength: number;
  /** 0 = lit pigment, 1 = self-luminous (fluorescence). */
  emissive: number;
  refraction: number;
  /** How mirror-like the jelly surface is (0–1). */
  gloss: number;
  swatch: [string, string];
}

/** Indices of the six general vec4 slots that precede the material colours. */
export const PALETTE = { absorb: 0, scatter: 1, background: 2, membrane: 3, optics: 4, ink: 5 } as const;

export function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [c[0], c[1], c[2]];
}

export function linearToHex(c: ArrayLike<number>): string {
  return '#' + [c[0], c[1], c[2]].map((v) => {
    const x = Math.min(1, Math.max(0, v));
    const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(255 * s).toString(16).padStart(2, '0');
  }).join('');
}

/**
 * Six general slots + one colour per material slot, as vec4s. Slot 4 is (refraction, emissive,
 * gloss, view); the renderer writes the view.
 */
export function packPalette(v: Variety, slots: number, absorbOverride?: Vec3): Float32Array {
  const o = new Float32Array((6 + slots) * 4);
  const set = (i: number, rgb: ArrayLike<number>, w = 1) => { o.set(rgb, 4 * i); o[4 * i + 3] = w; };
  set(PALETTE.absorb, absorbOverride ?? v.absorb);
  set(PALETTE.scatter, hexToLinear(v.scatter), v.scatterDensity);
  set(PALETTE.background, hexToLinear(v.background));
  set(PALETTE.membrane, hexToLinear(v.membrane), v.membraneStrength);
  set(PALETTE.optics, [v.refraction, v.emissive, v.gloss], 0);
  set(PALETTE.ink, hexToLinear(v.ink));
  for (let m = 1; m < slots; m++) set(6 + m, hexToLinear(v.colors[m] ?? v.scatter));
  return o;
}
