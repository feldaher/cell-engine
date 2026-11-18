// Composing the shader prelude: app constants, engine constants, and the organelle hooks the
// shaders call. An app defines any subset of the hooks; the rest keep the defaults below.
// The composite hook (v0.5.0) is composed separately: it goes only into the composite module.

/** "const K = v;" per entry, every value written as a WGSL float. */
export function wgslConstants(c: Record<string, number>, header = ''): string {
  const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  return (header ? `// ${header}\n` : '') + Object.entries(c).map(([k, v]) => `const ${k} = ${f(v)};`).join('\n') + '\n';
}

const DEFAULTS: Record<string, string> = {
  hookOrganelleOffset: 'fn hookOrganelleOffset(pos: vec3f, nrm: vec3f, rest: vec4f, time: f32) -> vec3f { return vec3f(0.0); }',
  hookOrganelleHidden: 'fn hookOrganelleHidden(mat: f32, coord: f32, rest: vec3f) -> bool { return false; }',
  hookOrganelleSurface: 'fn hookOrganelleSurface(base: vec3f, mat: f32, coord: f32, rest: vec3f) -> vec3f { return base; }',
  hookOrganelleGlow: 'fn hookOrganelleGlow(base: vec3f, N: vec3f, V: vec3f, mat: f32) -> vec3f { return defaultGlow(base, N, V); }',
  hookOrganelleFinish: 'fn hookOrganelleFinish(c: vec3f, N: vec3f, V: vec3f, mat: f32, emissive: f32) -> vec3f { return c; }',
  hookSectionOpacity: 'fn hookSectionOpacity(mat: f32) -> f32 { if (abs(mat - WALL_MAT) < 0.5) { return 0.8; } return 0.9; }',
};

/** Every hook the engine's shaders call. */
export const ORGANELLE_HOOKS = Object.keys(DEFAULTS);

/**
 * Ids written to the G-buffers' fourth channel (v0.5.0). An organelle of material m writes ORGANELLE + m, and a jelly
 * cut face over material m writes SECTION + m. All stay exact in an f16 channel for up to 2000 material slots.
 */
export function gbufferIds(materialSlots: number) {
  return { NONE: 0, FLOOR: 1, KNIFE: 2, SKIN: 3, ORGANELLE: 4, SECTION: 4 + materialSlots } as const;
}

export const COMPOSITE_HOOK_DEFAULT = 'fn hookComposite(c: vec3f, px: vec2i, uv: vec2f) -> vec3f { return c; }';
/** v0.6.0: the pixel's alpha. With a transparent canvas (RendererOptions.transparent) it lets the page show through. */
export const COMPOSITE_ALPHA_DEFAULT = 'fn hookCompositeAlpha(c: vec3f, px: vec2i, uv: vec2f) -> f32 { return 1.0; }';

/** The app's composite hooks, with the defaults (identity colour, opaque alpha) for any it leaves out. */
export function composeCompositeHook(app?: string): string {
  const a = app ?? '';
  const missing = [
    /fn\s+hookComposite\s*\(/.test(a) ? '' : COMPOSITE_HOOK_DEFAULT,
    /fn\s+hookCompositeAlpha\s*\(/.test(a) ? '' : COMPOSITE_ALPHA_DEFAULT,
  ].filter(Boolean);
  return (a ? a + '\n' : '') + missing.join('\n') + '\n';
}

export interface PreludeOptions {
  materialSlots: number;
  wallMaterial: number;
  /** Material drawn as rings within the wall (bud scars); negative for none. */
  scarMaterial: number;
  constantsWgsl?: string;
  organelleWgsl?: string;
}

export function composeShaderPrelude(o: PreludeOptions): string {
  const app = o.organelleWgsl ?? '';
  const missing = ORGANELLE_HOOKS.filter((h) => !new RegExp(`fn\\s+${h}\\s*\\(`).test(app)).map((h) => DEFAULTS[h]);
  return (o.constantsWgsl ?? '') + '\n'
    + `const MATERIAL_SLOTS = ${o.materialSlots}u;\n`
    + wgslConstants({ WALL_MAT: o.wallMaterial, SCAR_MAT: o.scarMaterial })
    + wgslConstants(Object.fromEntries(Object.entries(gbufferIds(o.materialSlots)).map(([k, v]) => [`GID_${k}`, v])))
    + app + '\n' + missing.join('\n') + '\n';
}
