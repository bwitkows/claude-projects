import { describe, expect, it } from 'vitest';
import { DEFAULT_C_ALPHA_PER_N, LinearTireModel } from './tire.js';

describe('LinearTireModel', () => {
  const tm = new LinearTireModel(DEFAULT_C_ALPHA_PER_N);

  it('is linear in slip at fixed fz', () => {
    const fz = 5000;
    const f1 = tm.lateralForce(0.01, fz, 'front');
    const f2 = tm.lateralForce(0.02, fz, 'front');
    expect(Math.abs(f2 - 2 * f1)).toBeLessThan(1e-12);
  });

  it('is linear in fz at fixed slip', () => {
    const slip = 0.05;
    const f1 = tm.lateralForce(slip, 5000, 'front');
    const f2 = tm.lateralForce(slip, 10000, 'front');
    expect(Math.abs(f2 - 2 * f1)).toBeLessThan(1e-12);
  });

  it('opposes slip — sign of force is opposite sign of slip', () => {
    const fz = 5000;
    expect(tm.lateralForce(+0.05, fz, 'front')).toBeLessThan(0);
    expect(tm.lateralForce(-0.05, fz, 'front')).toBeGreaterThan(0);
    expect(tm.lateralForce(+0.05, fz, 'front')).toBe(-tm.lateralForce(-0.05, fz, 'front'));
  });

  it('returns 0 when slip or fz is 0', () => {
    expect(tm.lateralForce(0, 5000, 'front')).toBe(-0);
    expect(tm.lateralForce(0.05, 0, 'front')).toBe(-0);
  });

  it('is independent of axle id (per spec — LinearTireModel ignores axle)', () => {
    const args: [number, number] = [0.05, 5000];
    expect(tm.lateralForce(args[0], args[1], 'front')).toBe(
      tm.lateralForce(args[0], args[1], 'rear'),
    );
  });
});
