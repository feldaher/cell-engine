import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { icosphere } from '../src/mesh/icosphere';
import { makeMembrane, membraneArea, step, type Membrane, type MembraneParams } from '../src/physics/membrane';
import { cavityPressure, cavityVolume, solveCavities, type Cavity } from '../src/physics/cavity';

const feature = await loadFeature('features/membrane.feature');
const R = 100, DT = 1 / 60;
const params = (substeps = 8): MembraneParams => ({ substeps, softness: 100, bendRatio: 0.05, damping: 20 });

function bubble(depth = 3) {
  const m = makeMembrane(icosphere([0, 0, 0], R, depth));
  const cav: Cavity = { tris: m.tris, target: cavityVolume(m.pos, m.tris), compliance: 0, lambda: 0 };
  return { m, cav };
}

function settle(m: Membrane, cav: Cavity, seconds: number, p = params()) {
  const h = DT / p.substeps;
  for (let f = 0, n = Math.round(seconds / DT); f < n; f++) step(m, p, DT, () => { solveCavities(m, [cav], h); });
  return h;
}

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario('A closed membrane left alone keeps its shape', ({ Given, When, Then, And }) => {
    let b: ReturnType<typeof bubble>, v0 = 0, a0 = 0;
    Given('a spherical membrane holding its own volume', () => { b = bubble(); v0 = cavityVolume(b.m.pos, b.m.tris); a0 = membraneArea(b.m); });
    When('one second is simulated', () => { settle(b.m, b.cav, 1); });
    Then('the volume is within 1 percent of where it started', () => expect(Math.abs(cavityVolume(b.m.pos, b.m.tris) / v0 - 1)).toBeLessThan(0.01));
    And('the area is within 1 percent of where it started', () => expect(Math.abs(membraneArea(b.m) / a0 - 1)).toBeLessThan(0.01));
  });

  Scenario('Inflating a membrane stretches it', ({ Given, When, Then, And }) => {
    let b: ReturnType<typeof bubble>, a0 = 0, h = 0;
    Given('a spherical membrane holding its own volume', () => { b = bubble(); a0 = membraneArea(b.m); });
    When('its target volume is raised by 20 percent and it settles', () => { b.cav.target *= 1.2; h = settle(b.m, b.cav, 2); });
    Then('the volume is within 1 percent of the target', () => expect(Math.abs(cavityVolume(b.m.pos, b.m.tris) / b.cav.target - 1)).toBeLessThan(0.01));
    // A sphere's area goes as V^(2/3), so 1.2 in volume is about 1.129 in area.
    And('the area has grown', () => expect(membraneArea(b.m) / a0).toBeGreaterThan(1.1));
    And('the cavity pressure is positive', () => expect(cavityPressure(b.cav, h)).toBeGreaterThan(0));
  });

  ScenarioOutline('What it settles to does not depend on the substeps', ({ Given, When, Then }, v) => {
    const areaWith = (substeps: number) => {
      const b = bubble();
      b.cav.target *= 1.2;
      settle(b.m, b.cav, 2, params(substeps));
      return membraneArea(b.m);
    };
    const reference = areaWith(16);
    let area = 0;
    Given('a spherical membrane holding its own volume', () => {});
    When('its target volume is raised by 20 percent and it settles with <substeps> substeps', () => { area = areaWith(Number(v.substeps)); });
    Then('the area is within 1 percent of the area reached with 16 substeps', () => expect(Math.abs(area / reference - 1)).toBeLessThan(0.01));
  });

  Scenario('Rolling a sheet is resisted, gently', ({ Given, When, Then, And }) => {
    // Edge springs alone cannot resist folding, because folding does not change any edge length.
    // Only the bending pairs pull a bent sheet back toward flat.
    const springBack = (bendRatio: number) => {
      const n = 10, side = 10;
      const pos: number[] = [], tris: number[] = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push((i / n) * side, (j / n) * side, 0);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a2 = i + (n + 1) * j, b2 = a2 + 1, c2 = a2 + n + 1, d2 = c2 + 1;
        tris.push(a2, b2, d2, a2, d2, c2);
      }
      const m = makeMembrane({ pos: Float32Array.from(pos), tris: Uint32Array.from(tris) });
      // Roll it onto a cylinder of radius rho about the held edge. Rolling is isometric: every
      // edge keeps its length, so the edge springs feel nothing and only bending can object.
      const rho = side;
      const tipNodes: number[] = [];
      for (let i = 0; i < m.invMass.length; i++) {
        const arc = m.pos[3 * i];                        // distance along the sheet from the held edge
        if (arc > side - 1e-6) tipNodes.push(i);         // noted before anything moves
        if (arc < 1e-6) m.invMass[i] = 0;
        m.pos[3 * i] = rho * Math.sin(arc / rho);
        m.pos[3 * i + 2] = rho * (1 - Math.cos(arc / rho));
      }
      const bentTip = rho * (1 - Math.cos(side / rho));
      m.prevPos.set(m.pos);
      const p: MembraneParams = { substeps: 8, softness: 100, bendRatio, damping: 20 };
      for (let f = 0; f < 240; f++) step(m, p, DT);
      let tip = 0;
      for (const i of tipNodes) tip += Math.abs(m.pos[3 * i + 2]);
      return { tip: tip / tipNodes.length, bentTip };
    };
    let bent = 0, tips: number[] = [];
    const ratios = [0, 1, 50, 1000];
    Given('a flat sheet held along one edge and rolled onto a cylinder', () => { bent = springBack(0).bentTip; });
    When('it is released and settles', () => { tips = ratios.map((r) => springBack(r).tip); });
    Then('a sheet with no fold resistance stays exactly where it was put, the roll being isometric', () => {
      expect(Math.abs(tips[0] / bent - 1)).toBeLessThan(0.01);
    });
    And('more fold resistance brings it back closer to flat', () => {
      for (let i = 1; i < tips.length; i++) expect(tips[i]).toBeLessThan(tips[i - 1]);
    });
    And('even a very stiff sheet returns only part of the way, the resistance being second order', () => {
      const returned = 1 - tips[tips.length - 1] / bent;
      expect(returned).toBeGreaterThan(0.1);
      expect(returned).toBeLessThan(0.5);
    });
  });

  Scenario('A deflated bubble keeps a sane shape', ({ Given, When, Then, And }) => {
    let b: ReturnType<typeof bubble>, a0 = 0;
    Given('a spherical membrane holding its own volume', () => { b = bubble(); a0 = membraneArea(b.m); });
    When('its target volume is lowered to 60 percent and it settles', () => { b.cav.target *= 0.6; settle(b.m, b.cav, 3); });
    Then('the volume is within 2 percent of the target', () => {
      expect(Math.abs(cavityVolume(b.m.pos, b.m.tris) / b.cav.target - 1)).toBeLessThan(0.02);
    });
    And('no triangle has turned inside out', () => {
      // Every triangle still faces away from the centre of the bubble.
      const { pos, tris } = b.m;
      let flipped = 0;
      for (let t = 0; t < tris.length; t += 3) {
        const i = 3 * tris[t], j = 3 * tris[t + 1], k = 3 * tris[t + 2];
        const ux = pos[j] - pos[i], uy = pos[j + 1] - pos[i + 1], uz = pos[j + 2] - pos[i + 2];
        const wx = pos[k] - pos[i], wy = pos[k + 1] - pos[i + 1], wz = pos[k + 2] - pos[i + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        if (pos[i] * nx + pos[i + 1] * ny + pos[i + 2] * nz < 0) flipped++;
      }
      expect(flipped).toBe(0);
    });
    And('the area has not grown', () => expect(membraneArea(b.m)).toBeLessThan(a0 * 1.01));
  });

  Scenario('Held nodes do not move', ({ Given, When, Then, And }) => {
    let b: ReturnType<typeof bubble>, held: number[] = [], start: Float32Array;
    Given('a spherical membrane with its lower half held', () => {
      b = bubble();
      held = [];
      for (let i = 0; i < b.m.invMass.length; i++) if (b.m.pos[3 * i + 1] < -R / 2) { held.push(i); b.m.invMass[i] = 0; }
      start = Float32Array.from(b.m.pos);
      expect(held.length).toBeGreaterThan(10);
    });
    When('its target volume is raised by 20 percent and it settles', () => { b.cav.target *= 1.2; settle(b.m, b.cav, 2); });
    Then('the held nodes are exactly where they started', () => {
      for (const i of held) for (let k = 0; k < 3; k++) expect(b.m.pos[3 * i + k]).toBe(start[3 * i + k]);
    });
    And('the free nodes have moved', () => {
      let moved = 0;
      for (let i = 0; i < b.m.invMass.length; i++) if (b.m.invMass[i] > 0 && Math.abs(b.m.pos[3 * i + 1] - start[3 * i + 1]) > 0.5) moved++;
      expect(moved).toBeGreaterThan(10);
    });
  });
});
