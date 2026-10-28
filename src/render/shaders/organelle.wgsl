// Organelles, drawn opaque inside the jelly and clipped at the piece's knife planes.
// What an organelle does beyond being lit (moving, hiding, surface detail, its own glow) comes
// from the hooks in the prelude (render/wgsl.ts), which an app may supply.

@group(2) @binding(0) var<uniform> piece: PieceU;

// coord: an app-defined per-vertex scalar (Jelly Cells: which organelle and how far along a tube).
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) rest: vec4f, @location(3) coord: f32 };
struct VOut { @builtin(position) clip: vec4f, @location(0) world: vec3f, @location(1) nrm: vec3f, @location(2) rest: vec3f, @location(3) mat: f32, @location(4) coord: f32 };

@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  let pos = v.pos + hookOrganelleOffset(v.pos, v.nrm, v.rest, F.params.x);
  o.clip = F.viewProj * vec4f(pos, 1.0);
  o.world = pos; o.nrm = v.nrm; o.rest = v.rest.xyz; o.mat = v.rest.w; o.coord = v.coord;
  return o;
}

fn clippedAway(rest: vec3f) -> bool {
  let n = u32(piece.info.x + 0.5);
  for (var i = 0u; i < n; i++) {
    // a hair inside the knife face, so the section on the face always covers the cut organelle
    if (dot(piece.planes[i].xyz, rest) > piece.planes[i].w - 0.04) { return true; }
  }
  return false;
}

@fragment fn fs(in: VOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  if (clippedAway(in.rest) || isHidden(in.mat) || hookOrganelleHidden(in.mat, in.coord, in.rest)) { discard; }
  var N = normalize(in.nrm);
  let V = normalize(F.camPos.xyz - in.world);
  if (dot(N, V) < 0.0) { N = -N; }
  let base = hookOrganelleSurface(materialColor(in.mat), in.mat, in.coord, in.rest);
  let L = F.lightDir.xyz;
  let emissive = F.palette[4].y;
  let sh = shadowAt(in.world, 1.2);
  let diff = (0.5 + 0.5 * dot(N, L)) * (0.55 + 0.45 * sh);
  var c = base * (0.3 + 0.8 * diff) + vec3f(ggx(N, V, L, 0.35) * 0.25 * sh);
  c = mix(c, hookOrganelleGlow(base, N, V, in.mat), emissive);
  c = hookOrganelleFinish(c, N, V, in.mat, emissive);
  // the deformation view ghosts the organelles so the jelly's colours read clearly
  if (viewMode() > 0.5) { c = mix(c, F.palette[2].rgb, 0.7); }
  // teaching highlight: the named organelle glows, everything else recedes
  let hl = highlight();
  if (hl > -0.5) {
    if (abs(in.mat - hl) < 0.5) {
      c = c * 1.15 + base * (0.35 + 0.25 * sin(F.params.x * 4.0));
    } else {
      c = mix(c, F.palette[2].rgb, 0.65);
    }
  }
  return vec4f(c, 1.0);
}
