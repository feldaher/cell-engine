# cell-engine

Soft bodies made from signed distance fields, for the browser: tetrahedral meshing, surface nets, barycentric embedding, an XPBD solver (gelatin and tissue-scale regimes), contact, cutting, reaction–diffusion fields on the mesh, and the WebGPU jelly renderer. TypeScript with no runtime dependencies.

Shared by [Jelly Cells](https://github.com/feldaher/jelly-cells), [Regrow](https://github.com/feldaher/regrow), [Close the Wound](https://github.com/feldaher/microglia-brain-repair-game) and Breath. The engine knows nothing about cells or tissues: an app describes a body as a `Shape` (a signed distance, its cut planes and a material per point) and gives each material id its meaning.

## Use

```json
"dependencies": { "@feldaher/cell-engine": "git+https://github.com/feldaher/cell-engine.git#v0.4.0" }
```

The package ships TypeScript source (`import { buildSimMesh } from '@feldaher/cell-engine/mesh/tetgen'`). In the app's Vite config:

```ts
optimizeDeps: { exclude: ['@feldaher/cell-engine'] },
test: { server: { deps: { inline: ['@feldaher/cell-engine'] } } },
```

## Modules

| Module | What it does |
|---|---|
| `contracts` | the types every module agrees on: `Shape`, `PieceSource`, `SimMesh`, `SkinMesh`, `Piece`, `SimParams`, `FieldSolver` |
| `sdf/primitives` | ellipsoid, capsule, torus, cone, disc and bowl SDFs; smooth union; plane distance; gradient |
| `mesh/tetgen` | a shape → body-centred cubic tet mesh with boundary nodes snapped to the surface |
| `mesh/surface` | a shape → render skin by surface nets, with sharp knife creases |
| `mesh/embed` | points and meshes that ride inside the tets by barycentric weights |
| `mesh/boundary` | the tet mesh's own surface, as outward-wound triangles over its particles |
| `mesh/piece` | a `PieceSource` + cut planes → soft-body pieces with skin and passengers |
| `physics/xpbd` | many pieces, co-rotational tets + volume, floor, contact, grab (gelatin regime) |
| `physics/soft` | one tissue-scale body whose settled shape does not depend on the substep count |
| `physics/cavity` | an enclosed volume held to a target, with its pressure from the multiplier (breathing) |
| `physics/membrane` | a thin sheet as a surface: stretch along the edges, fold resistance across them |
| `mesh/icosphere` | a closed sphere with a topology you can rely on, by radius or by the volume it must enclose |
| `cut/cut`, `cut/knife` | a world plane splits pieces; children inherit the motion; an animated blade |
| `fields/fem` | reaction–diffusion by P1 FEM with lumped mass and backward Euler, amount-conserving under deformation, over tetrahedra in a volume or triangles on a surface |
| `render/renderer` | WebGPU jelly: refraction, Beer–Lambert absorption, sections at knife faces, organelles, shadows. The app gives a palette, packed primitives and optional WGSL hooks |
| `render/palette`, `render/primitives`, `render/wgsl` | palette packing and sRGB conversion; primitive packing and the hidden-material mask; the shader prelude and the organelle hooks with their defaults |
| `ui/plot` | a canvas plot of series: nice ticks, bounds, faint earlier runs, dashed traces, marks |
| `game/record` | a run kept as frames at a fixed interval, scrubbed by a playhead; a seeded generator for replay |

## Test

```sh
npm install
npm test        # Gherkin features in features/, run by vitest
```

Design: `../outputs/design/2026-10-20_engine-extraction.md`; the renderer and v0.4.0: `2026-10-22_renderer-extraction.md`, `2026-10-28_v0.4.0-contract.md`.

The renderer imports its shaders with Vite's `?raw`, so it needs a Vite (or vitest) build.
