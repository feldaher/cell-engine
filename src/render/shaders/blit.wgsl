// Final composite to the canvas: a highlight shoulder, a gentle vignette, the app's composite hooks (colour, then
// alpha, v0.6.0), gamma and dither. The output is premultiplied; with an opaque canvas alpha is 1 and has no effect.
// Preceded by the prelude, the composite hook (render/wgsl.ts) and common.wgsl, so the hook can read the Frame
// uniform (palette, light, screen) and the two G-buffers below (v0.5.0).
@group(1) @binding(0) var src: texture_2d<f32>;
@group(1) @binding(1) var<uniform> bg: vec4f;
@group(1) @binding(2) var gOpaque: texture_2d<f32>;
@group(1) @binding(3) var gJelly: texture_2d<f32>;

struct VOut { @builtin(position) clip: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  let p = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VOut;
  o.clip = vec4f(p[vi], 0.0, 1.0);
  o.uv = p[vi] * vec2f(0.5, -0.5) + 0.5;
  return o;
}

/** (view normal x, view normal y, linear view depth, id) of the opaque layer: floor, organelles, knife. */
fn gOpaqueAt(px: vec2i) -> vec4f { return textureLoad(gOpaque, px, 0); }
/** The same for the front-most jelly surface: GID_SKIN, or GID_SECTION + material on a cut face. */
fn gJellyAt(px: vec2i) -> vec4f { return textureLoad(gJelly, px, 0); }
fn gLayerAt(layer: u32, px: vec2i) -> vec4f { if (layer == 0u) { return gOpaqueAt(px); } return gJellyAt(px); }
/** The unit view-space normal of a G-buffer texel (it faces the camera, so z ≥ 0). */
fn viewNormal(g: vec4f) -> vec3f { return vec3f(g.xy, sqrt(max(0.0, 1.0 - dot(g.xy, g.xy)))); }

/**
 * 1 where a line belongs: one of the four neighbours at distance r has another id, lies more than depthRel × depth
 * nearer or farther, or turns the normal by more than acos(creaseCos). Layer 0 is opaque, 1 is jelly.
 */
fn inkEdge(layer: u32, px: vec2i, r: i32, depthRel: f32, creaseCos: f32) -> f32 {
  let size = vec2i(textureDimensions(gOpaque));
  if (px.x < r || px.y < r || px.x >= size.x - r || px.y >= size.y - r) { return 0.0; }
  let c = gLayerAt(layer, px);
  let nc = viewNormal(c);
  let offs = array<vec2i, 4>(vec2i(r, 0), vec2i(-r, 0), vec2i(0, r), vec2i(0, -r));
  for (var k = 0; k < 4; k++) {
    let g = gLayerAt(layer, px + offs[k]);
    if (abs(g.w - c.w) > 0.5) { return 1.0; }
    if (c.w > GID_NONE + 0.5) {
      if (abs(g.z - c.z) > depthRel * min(g.z, c.z)) { return 1.0; }
      if (dot(viewNormal(g), nc) < creaseCos) { return 1.0; }
    }
  }
  return 0.0;
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let px = vec2i(in.clip.xy);
  var c = textureLoad(src, px, 0).rgb;
  // soft shoulder so highlights roll off instead of clipping
  let peak = max(c.r, max(c.g, c.b));
  if (peak > 0.8) { c *= (0.8 + (1.0 - exp(-(peak - 0.8) * 2.5)) * 0.2) / peak; }
  let d = distance(in.uv, vec2f(0.5));
  c *= 1.0 - bg.w * smoothstep(0.45, 0.9, d);
  c = hookComposite(c, px, in.uv);
  let a = clamp(hookCompositeAlpha(c, px, in.uv), 0.0, 1.0);
  var s = toSrgb(max(c, vec3f(0.0)));
  let n = fract(sin(dot(in.clip.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  s += (n - 0.5) / 255.0;
  return vec4f(s * a, a);
}
