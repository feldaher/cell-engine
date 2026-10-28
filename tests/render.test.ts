import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { hexToLinear, linearToHex, packPalette, PALETTE, type Variety } from '../src/render/palette';
import { hiddenMask, isHiddenIn, packPrimitives, type BodyPart } from '../src/render/primitives';
import { composeShaderPrelude, ORGANELLE_HOOKS, wgslConstants } from '../src/render/wgsl';
import { Prim, PRIM_STRIDE, type Primitive } from '../src/contracts';

const feature = await loadFeature('features/render.feature');

const variety = (): Variety => ({
  id: 'test', name: 'Test', background: '#336699', ink: '#000000', absorb: [0.1, 0.2, 0.3],
  scatter: '#ccbbaa', scatterDensity: 0.4, colors: { 3: '#ff0000' }, membrane: '#111111', membraneStrength: 0.5,
  emissive: 1, refraction: 0.03, gloss: 0.7, swatch: ['#000000', '#ffffff'],
});
const ell = (material: number): Primitive => ({ kind: Prim.Ellipsoid, material, R: 0, r: 0, a: [0, 0, 0], b: [1, 1, 1] });
const close3 = (a: ArrayLike<number>, b: ArrayLike<number>) => { for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 6); };

describeFeature(feature, ({ Scenario }) => {
  Scenario('A palette packs to the layout the shaders read', ({ Given, When, Then, And }) => {
    let v: Variety, p: Float32Array;
    Given('a variety with a background, a scatter colour and a colour for material 3', () => { v = variety(); });
    When('it is packed for 24 material slots', () => { p = packPalette(v, 24); });
    Then('the packed palette holds 30 vec4s', () => expect(p.length).toBe(30 * 4));
    And('slot 2 is the background in linear colour', () => close3(p.subarray(4 * PALETTE.background), hexToLinear('#336699')));
    And('material 3 has its own colour and material 5 takes the scatter colour', () => {
      close3(p.subarray(4 * (6 + 3)), hexToLinear('#ff0000'));
      close3(p.subarray(4 * (6 + 5)), hexToLinear('#ccbbaa'));
    });
    And('the optics slot holds refraction, emissive and gloss', () => close3(p.subarray(4 * PALETTE.optics), [0.03, 1, 0.7]));
  });

  Scenario('Colours convert between sRGB hex and linear exactly enough to round-trip', ({ Then }) => {
    Then('every 8-bit grey level survives hex to linear and back', () => {
      for (let g = 0; g < 256; g++) {
        const hex = '#' + g.toString(16).padStart(2, '0').repeat(3);
        expect(linearToHex(hexToLinear(hex))).toBe(hex);
      }
    });
  });

  Scenario('Primitives pack with their op and blend', ({ Given, When, Then, And }) => {
    let body: BodyPart[], org: Primitive[], buf: Float32Array;
    Given('a body of a union part, a subtracted part and one organelle', () => {
      body = [{ prim: ell(0), op: 'union', blend: 0 }, { prim: ell(0), op: 'subtract', blend: 0.25 }];
      org = [ell(2)];
    });
    When('they are packed', () => { buf = packPrimitives(body, org); });
    Then('there are three primitives of 12 floats each', () => expect(buf.length).toBe(3 * PRIM_STRIDE));
    And('the subtracted part carries op 1 and its blend', () => {
      expect(buf[PRIM_STRIDE + 7]).toBe(1);
      expect(buf[PRIM_STRIDE + 11]).toBeCloseTo(0.25, 6);
    });
    And('the organelle carries op 0', () => { expect(buf[2 * PRIM_STRIDE + 7]).toBe(0); expect(buf[2 * PRIM_STRIDE + 1]).toBe(2); });
  });

  Scenario('The hidden-material mask survives the float uniform', ({ Given, Then, And }) => {
    let mats: number[], mask: number;
    Given('the materials 0 to 23', () => { mats = Array.from({ length: 24 }, (_, i) => i); mask = hiddenMask(mats); });
    Then('their mask is exact as a 32-bit float', () => expect(Math.fround(mask)).toBe(mask));
    And('each of them reads back as hidden', () => { for (const m of mats) expect(isHiddenIn(Math.fround(mask), m)).toBe(true); });
    And('a mask asked to hide material 24 is refused', () => expect(() => hiddenMask([24])).toThrow());
  });

  Scenario('Hooks the app leaves out get the engine\'s defaults', ({ When, Then, And }) => {
    let s = '';
    When('the shader prelude is composed without hooks', () => { s = composeShaderPrelude({ materialSlots: 24, wallMaterial: 1, scarMaterial: -1 }); });
    Then('it defines every organelle hook once', () => {
      for (const h of ORGANELLE_HOOKS) expect(s.split(`fn ${h}(`).length - 1).toBe(1);
    });
    And('it defines MATERIAL_SLOTS, WALL_MAT and SCAR_MAT', () => {
      expect(s).toMatch(/const MATERIAL_SLOTS = 24u;/);
      expect(s).toMatch(/const WALL_MAT = 1\.0;/);
      expect(s).toMatch(/const SCAR_MAT = -1\.0;/);
    });
    When('the prelude is composed with an app hook for the organelle surface', () => {
      s = composeShaderPrelude({ materialSlots: 24, wallMaterial: 1, scarMaterial: -1,
        organelleWgsl: 'fn hookOrganelleSurface(base: vec3f, mat: f32, coord: f32, rest: vec3f) -> vec3f { return base * 0.5; }' });
    });
    Then('the app\'s surface hook is used and the other hooks keep their defaults', () => {
      expect(s).toContain('return base * 0.5;');
      for (const h of ORGANELLE_HOOKS) expect(s.split(`fn ${h}(`).length - 1).toBe(1);
    });
  });

  Scenario('Constants are written as WGSL floats', ({ When, Then }) => {
    let s = '';
    When('the constants a = 2 and b = 0.25 are written', () => { s = wgslConstants({ a: 2, b: 0.25 }); });
    Then('the text declares a as 2.0 and b as 0.25', () => {
      expect(s).toContain('const a = 2.0;');
      expect(s).toContain('const b = 0.25;');
    });
  });
});
