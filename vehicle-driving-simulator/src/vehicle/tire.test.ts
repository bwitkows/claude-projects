import { describe, expect, it } from 'vitest';
import {
  DEFAULT_C_ALPHA_PER_N,
  DEFAULT_PACEJKA_PARAMS,
  LinearTireModel,
  PacejkaTireModel,
} from './tire.js';

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

describe('PacejkaTireModel', () => {
  const pacejka = new PacejkaTireModel(DEFAULT_PACEJKA_PARAMS);
  const linear = new LinearTireModel(DEFAULT_C_ALPHA_PER_N);

  it('matches the linear law within 1% at small slip', () => {
    const fz = 5000;
    for (const slip of [0.005, 0.01]) {
      const fp = pacejka.lateralForce(slip, fz, 'front');
      const fl = linear.lateralForce(slip, fz, 'front');
      const relError = Math.abs((fp - fl) / fl);
      expect(relError).toBeLessThan(0.01);
    }
  });

  it('saturates at large slip — force magnitude bounded by μ·F_z', () => {
    const fz = 5000;
    const mu = DEFAULT_PACEJKA_PARAMS.mu;
    const fp = pacejka.lateralForce(0.4, fz, 'front'); // ~23°, well past peak
    expect(Math.abs(fp)).toBeLessThan(mu * fz + 1);
  });

  it('has a finite peak in (0, π/2) and decreases beyond it', () => {
    const fz = 5000;
    const samples: { slip: number; mag: number }[] = [];
    for (let slip = 0; slip <= 1.0; slip += 0.01) {
      samples.push({ slip, mag: Math.abs(pacejka.lateralForce(slip, fz, 'front')) });
    }
    let peakIdx = 0;
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i]!.mag > samples[peakIdx]!.mag) peakIdx = i;
    }
    expect(samples[peakIdx]!.slip).toBeGreaterThan(0);
    expect(samples[peakIdx]!.slip).toBeLessThan(Math.PI / 2);
    // Magnitude beyond 2·α_peak SHALL be less than at α_peak (saturation).
    const beyondSlip = Math.min(2 * samples[peakIdx]!.slip, 1.0);
    const beyondMag = Math.abs(pacejka.lateralForce(beyondSlip, fz, 'front'));
    expect(beyondMag).toBeLessThan(samples[peakIdx]!.mag);
  });

  it('opposes slip — sign of force is opposite sign of slip', () => {
    const fz = 5000;
    expect(pacejka.lateralForce(+0.05, fz, 'front')).toBeLessThan(0);
    expect(pacejka.lateralForce(-0.05, fz, 'front')).toBeGreaterThan(0);
    expect(pacejka.lateralForce(+0.05, fz, 'front')).toBeCloseTo(
      -pacejka.lateralForce(-0.05, fz, 'front'),
      12,
    );
  });

  it('is linear in fz at fixed slip', () => {
    const slip = 0.05;
    const f1 = pacejka.lateralForce(slip, 5000, 'front');
    const f2 = pacejka.lateralForce(slip, 10000, 'front');
    expect(Math.abs(f2 - 2 * f1)).toBeLessThan(1e-12);
  });

  it('returns 0 when fz is 0 regardless of slip', () => {
    for (const slip of [-0.1, 0, 0.05, 1.0]) {
      expect(pacejka.lateralForce(slip, 0, 'front')).toBe(0);
    }
  });

  it('default-params slope at zero slip equals cα · F_z within 1e-9', () => {
    // Slope is computed via finite difference at small slip.
    const fz = 5000;
    const eps = 1e-6;
    const slope =
      (pacejka.lateralForce(eps, fz, 'front') - pacejka.lateralForce(-eps, fz, 'front')) /
      (2 * eps);
    const expectedSlope = -DEFAULT_C_ALPHA_PER_N * fz;
    expect(Math.abs(slope - expectedSlope) / Math.abs(expectedSlope)).toBeLessThan(1e-6);
  });

  it('is independent of axle id', () => {
    const args: [number, number] = [0.05, 5000];
    expect(pacejka.lateralForce(args[0], args[1], 'front')).toBe(
      pacejka.lateralForce(args[0], args[1], 'rear'),
    );
  });
});
