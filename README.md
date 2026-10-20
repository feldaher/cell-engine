# cell-engine

Soft bodies made from signed distance fields, for the browser: tetrahedral meshing, surface nets, barycentric embedding, an XPBD solver (gelatin and tissue-scale regimes), contact, cutting, and reaction–diffusion fields on the mesh. TypeScript with no runtime dependencies.

Shared by [Jelly Cells](https://github.com/feldaher/jelly-cells), [Regrow](https://github.com/feldaher/regrow), [Close the Wound](https://github.com/feldaher/microglia-brain-repair-game) and Breath. The engine knows nothing about cells or tissues: an app describes a body as a `Shape` (a signed distance, its cut planes and a material per point) and gives each material id its meaning.

## Use

```json
"dependencies": { "@feldaher/cell-engine": "github:feldaher/cell-engine#v0.1.0" }
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
| `mesh/piece` | a `PieceSource` + cut planes → soft-body pieces with skin and passengers |
| `physics/xpbd` | many pieces, co-rotational tets + volume, floor, contact, grab (gelatin regime) |
| `physics/soft` | one tissue-scale body whose settled shape does not depend on the substep count |
| `cut/cut`, `cut/knife` | a world plane splits pieces; children inherit the motion; an animated blade |
| `fields/fem` | reaction–diffusion, P1 FEM with lumped mass, backward Euler, amount-conserving under deformation |

## Test

```sh
npm install
npm test        # Gherkin features in features/, run by vitest
```

Design: `../outputs/design/2026-10-20_engine-extraction.md` in the project folder.
