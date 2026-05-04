import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap.js';

describe('Heightmap — heightAt', () => {
  const h = new Heightmap();

  it('is a pure function (same input → same output)', () => {
    const samples: [number, number][] = [
      [0, 0],
      [12.5, -7.3],
      [-50, 50],
      [99.9, 0.1],
    ];
    for (const [x, z] of samples) {
      const a = h.heightAt(x, z);
      const b = h.heightAt(x, z);
      expect(a).toBe(b);
    }
  });

  it('returns finite, bounded heights over the rendered region', () => {
    let max = 0;
    // Sample a 41×41 grid over the rendered ±100 m region.
    for (let i = 0; i <= 40; i += 1) {
      for (let j = 0; j <= 40; j += 1) {
        const x = -100 + i * 5;
        const z = -100 + j * 5;
        const y = h.heightAt(x, z);
        expect(Number.isFinite(y)).toBe(true);
        if (Math.abs(y) > max) max = Math.abs(y);
      }
    }
    expect(max).toBeLessThanOrEqual(6);
  });

  it('is non-trivial (not constant)', () => {
    const a = h.heightAt(0, 0);
    const b = h.heightAt(30, 0);
    const c = h.heightAt(0, 30);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('Heightmap — normalAt', () => {
  const h = new Heightmap();

  it('returns a unit vector (magnitude = 1) at multiple sample points', () => {
    const samples: [number, number][] = [
      [0, 0],
      [12.5, -7.3],
      [-50, 50],
      [99.9, 0.1],
      [3.14, 2.71],
    ];
    for (const [x, z] of samples) {
      const n = h.normalAt(x, z);
      const mag = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      expect(Math.abs(mag - 1)).toBeLessThan(1e-12);
      expect(n.y).toBeGreaterThan(0); // points up
    }
  });

  it('agrees with a numerical finite-difference normal', () => {
    const eps = 1e-4;
    const samples: [number, number][] = [
      [0, 0],
      [12.5, -7.3],
      [-50, 50],
    ];
    for (const [x, z] of samples) {
      const dhdxNumeric = (h.heightAt(x + eps, z) - h.heightAt(x - eps, z)) / (2 * eps);
      const dhdzNumeric = (h.heightAt(x, z + eps) - h.heightAt(x, z - eps)) / (2 * eps);
      const lenNumeric = Math.sqrt(dhdxNumeric * dhdxNumeric + 1 + dhdzNumeric * dhdzNumeric);
      const numericNormal = {
        x: -dhdxNumeric / lenNumeric,
        y: 1 / lenNumeric,
        z: -dhdzNumeric / lenNumeric,
      };
      const analytic = h.normalAt(x, z);
      expect(Math.abs(analytic.x - numericNormal.x)).toBeLessThan(1e-6);
      expect(Math.abs(analytic.y - numericNormal.y)).toBeLessThan(1e-6);
      expect(Math.abs(analytic.z - numericNormal.z)).toBeLessThan(1e-6);
    }
  });
});

describe('Heightmap — partial derivatives', () => {
  const h = new Heightmap();

  it('partialX matches a central-difference numerical derivative', () => {
    const eps = 1e-4;
    for (const [x, z] of [
      [10, 5],
      [-25, 15],
    ] as [number, number][]) {
      const numeric = (h.heightAt(x + eps, z) - h.heightAt(x - eps, z)) / (2 * eps);
      const analytic = h.partialX(x, z);
      expect(Math.abs(numeric - analytic)).toBeLessThan(1e-6);
    }
  });

  it('partialZ matches a central-difference numerical derivative', () => {
    const eps = 1e-4;
    for (const [x, z] of [
      [10, 5],
      [-25, 15],
    ] as [number, number][]) {
      const numeric = (h.heightAt(x, z + eps) - h.heightAt(x, z - eps)) / (2 * eps);
      const analytic = h.partialZ(x, z);
      expect(Math.abs(numeric - analytic)).toBeLessThan(1e-6);
    }
  });
});
