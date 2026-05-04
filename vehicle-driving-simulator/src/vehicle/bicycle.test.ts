import { describe, expect, it, vi } from 'vitest';
import { SyntheticInputSource } from '../input/synthetic.js';
import type { ControlState } from '../input/types.js';
import { SIM_DT } from '../sim/clock.js';
import { BicycleVehicle, DEFAULT_BICYCLE_PARAMS, type TireForceFn } from './bicycle.js';

const NEUTRAL: ControlState = { throttle: 0, brake: 0, steer: 0 };
const FULL_THROTTLE: ControlState = { throttle: 1, brake: 0, steer: 0 };

function throttleUntil(v: BicycleVehicle, predicate: () => boolean, maxSteps: number): number {
  let n = 0;
  while (!predicate() && n < maxSteps) {
    v.step(SIM_DT, FULL_THROTTLE);
    n += 1;
  }
  return n;
}

describe('BicycleVehicle — pure forward acceleration', () => {
  it('produces no lateral motion under steer=0', () => {
    const v = new BicycleVehicle();
    for (let i = 0; i < 240; i += 1) v.step(SIM_DT, FULL_THROTTLE);
    expect(Math.abs(v.state.vy)).toBeLessThan(1e-9);
    expect(Math.abs(v.state.yawRate)).toBeLessThan(1e-9);
    expect(Math.abs(v.state.x)).toBeLessThan(1e-9);
    expect(Math.abs(v.state.heading)).toBeLessThan(1e-9);
    expect(v.state.vx).toBeGreaterThan(0);
    expect(v.state.z).toBeGreaterThan(0);
  });

  it('saturates at vMax under sustained throttle', () => {
    const v = new BicycleVehicle();
    // Linear drag has time constant m/dragCoef ≈ 4.17s; 30 sim seconds gives
    // ~7 time constants which is well within 0.5 m/s of the asymptote.
    for (let i = 0; i < 240 * 30; i += 1) v.step(SIM_DT, FULL_THROTTLE);
    expect(v.state.vx).toBeGreaterThan(DEFAULT_BICYCLE_PARAMS.vMax - 0.5);
    expect(v.state.vx).toBeLessThanOrEqual(DEFAULT_BICYCLE_PARAMS.vMax);
  });
});

describe('BicycleVehicle — steering response', () => {
  it('develops vy and yawRate when steered at speed', () => {
    const v = new BicycleVehicle();
    throttleUntil(v, () => v.state.vx > DEFAULT_BICYCLE_PARAMS.vMax / 2, 240 * 5);
    expect(v.state.vx).toBeGreaterThan(DEFAULT_BICYCLE_PARAMS.vMax / 2);
    const ctrl: ControlState = { throttle: 1, brake: 0, steer: 1 };
    for (let i = 0; i < 240; i += 1) v.step(SIM_DT, ctrl);
    expect(Math.abs(v.state.vy)).toBeGreaterThan(0.05);
    expect(Math.abs(v.state.yawRate)).toBeGreaterThan(0.1);
  });

  it('larger steer produces larger one-step yaw change at the same state', () => {
    const v1 = new BicycleVehicle();
    const v2 = new BicycleVehicle();
    // Bring both to identical high-speed state.
    for (let i = 0; i < 240 * 4; i += 1) {
      v1.step(SIM_DT, FULL_THROTTLE);
      v2.step(SIM_DT, FULL_THROTTLE);
    }
    expect(v1.state.vx).toBeCloseTo(v2.state.vx, 12);
    const r1Before = v1.state.yawRate;
    const r2Before = v2.state.yawRate;
    v1.step(SIM_DT, { throttle: 1, brake: 0, steer: 0.5 });
    v2.step(SIM_DT, { throttle: 1, brake: 0, steer: 1.0 });
    const d1 = Math.abs(v1.state.yawRate - r1Before);
    const d2 = Math.abs(v2.state.yawRate - r2Before);
    expect(d2).toBeGreaterThan(d1);
    // Sign agreement: both turn the same way.
    expect(Math.sign(v1.state.yawRate - r1Before)).toBe(Math.sign(v2.state.yawRate - r2Before));
  });
});

describe('BicycleVehicle — steady-state cornering', () => {
  // INTERPRETATION (spec scenario "Yaw rate stabilizes under constant inputs"):
  // The spec says 5% range/mean over the final second after 5 simulated
  // seconds of stepping at `throttle=0.5, steer=0.3` from rest. With
  // automotive parameters and linear drag, the longitudinal time constant
  // m/dragCoef = 4.17 s, so at t=5 s vx is at ~70% of its steady-state value
  // (12.5 m/s), and yaw rate is still climbing along with it. The 5% / 5 s
  // pair is mutually inconsistent at these params; we still assert
  // convergence is happening (range/mean is bounded and decreasing) but
  // loosen the threshold to 30%. This is a self-spec defect — flagged in
  // notes.md.
  it('yaw rate is converging under constant input', () => {
    const v = new BicycleVehicle();
    const ctrl: ControlState = { throttle: 0.5, brake: 0, steer: 0.3 };
    for (let i = 0; i < 240 * 4; i += 1) v.step(SIM_DT, ctrl);
    // Sample the last simulated second.
    const samples: number[] = [];
    for (let i = 0; i < 240; i += 1) {
      v.step(SIM_DT, ctrl);
      samples.push(v.state.yawRate);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const range = Math.max(...samples) - Math.min(...samples);
    expect(Math.abs(mean)).toBeGreaterThan(1e-3); // a turn IS happening
    expect(range / Math.abs(mean)).toBeLessThan(0.3);
    // Sanity: signal is monotonic-ish, not oscillating; range ≈ |last-first|.
    const drift = Math.abs(samples.at(-1)! - samples[0]!);
    expect(drift / range).toBeGreaterThan(0.7);
  });

  it('converges tightly under constant input given enough time', () => {
    // Bonus check: with 20 simulated seconds (~5 time constants), the strict
    // 5%-of-mean criterion that the spec asked for IS achievable.
    const v = new BicycleVehicle();
    const ctrl: ControlState = { throttle: 0.5, brake: 0, steer: 0.3 };
    for (let i = 0; i < 240 * 19; i += 1) v.step(SIM_DT, ctrl);
    const samples: number[] = [];
    for (let i = 0; i < 240; i += 1) {
      v.step(SIM_DT, ctrl);
      samples.push(v.state.yawRate);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const range = Math.max(...samples) - Math.min(...samples);
    expect(range / Math.abs(mean)).toBeLessThan(0.05);
  });
});

describe('BicycleVehicle — low-speed regime', () => {
  it('produces no NaN or Infinity at standstill under any input combination', () => {
    const v = new BicycleVehicle();
    const inputs: ControlState[] = [
      { throttle: 0, brake: 0, steer: 1 },
      { throttle: 0, brake: 1, steer: -1 },
      { throttle: 0, brake: 0, steer: -1 },
      { throttle: 0, brake: 1, steer: 1 },
    ];
    for (let i = 0; i < 240; i += 1) {
      const ctrl = inputs[i % inputs.length]!;
      v.step(SIM_DT, ctrl);
      const s = v.state;
      for (const key of [
        'x',
        'z',
        'heading',
        'speed',
        'vx',
        'vy',
        'yawRate',
        'slipF',
        'slipR',
      ] as const) {
        expect(Number.isFinite(s[key])).toBe(true);
      }
    }
    // The spec only requires no NaN/Infinity at standstill. The body-frame
    // cross-coupling term `vy * r` accumulates a tiny forward vx under
    // alternating steer at zero throttle (~10⁻⁴ m/s after 1 s), which is
    // expected and harmless; assert vx stays effectively at standstill.
    expect(v.state.vx).toBeLessThan(0.01);
  });

  it('replays identically across the low-speed → high-speed transition', () => {
    const events = [
      { t: 0, state: { throttle: 0, brake: 0, steer: 1 } },
      { t: 0.5, state: { throttle: 1, brake: 0, steer: 1 } },
      { t: 1.5, state: { throttle: 1, brake: 0, steer: -0.5 } },
      { t: 2.0, state: { throttle: 0, brake: 1, steer: 0 } },
    ];
    const a = new BicycleVehicle();
    const b = new BicycleVehicle();
    const srcA = new SyntheticInputSource(events);
    const srcB = new SyntheticInputSource(events);
    for (let i = 0; i < 600; i += 1) {
      const t = i * SIM_DT;
      a.step(SIM_DT, srcA.read(t));
      b.step(SIM_DT, srcB.read(t));
      const sa = a.state;
      const sb = b.state;
      expect(Math.abs(sa.vx - sb.vx)).toBeLessThan(1e-8);
      expect(Math.abs(sa.vy - sb.vy)).toBeLessThan(1e-8);
      expect(Math.abs(sa.yawRate - sb.yawRate)).toBeLessThan(1e-8);
      expect(Math.abs(sa.heading - sb.heading)).toBeLessThan(1e-8);
      expect(Math.abs(sa.x - sb.x)).toBeLessThan(1e-8);
      expect(Math.abs(sa.z - sb.z)).toBeLessThan(1e-8);
    }
  });
});

describe('BicycleVehicle — replay equivalence', () => {
  it('matches step-for-step within 1e-8 over 240 steps with mixed input', () => {
    const events = [
      { t: 0, state: { throttle: 1, brake: 0, steer: 0 } },
      { t: 0.5, state: { throttle: 1, brake: 0, steer: 0.6 } },
      { t: 0.75, state: { throttle: 0.5, brake: 0, steer: -0.4 } },
      { t: 1.0, state: { throttle: 0, brake: 1, steer: 0 } },
    ];
    const a = new BicycleVehicle();
    const b = new BicycleVehicle();
    const srcA = new SyntheticInputSource(events);
    const srcB = new SyntheticInputSource(events);
    for (let i = 0; i < 240; i += 1) {
      const t = i * SIM_DT;
      a.step(SIM_DT, srcA.read(t));
      b.step(SIM_DT, srcB.read(t));
      for (const key of ['vx', 'vy', 'yawRate', 'slipF', 'slipR', 'heading', 'x', 'z'] as const) {
        expect(Math.abs(a.state[key] - b.state[key])).toBeLessThan(1e-8);
      }
    }
  });
});

describe('BicycleVehicle — tire force injection', () => {
  it('invokes tireFn twice per step (once per axle) with correct axle ids', () => {
    const fn = vi.fn<TireForceFn>((s, _axle, p) => -p.cAlpha * s);
    const v = new BicycleVehicle({ tireFn: fn });
    v.step(SIM_DT, FULL_THROTTLE);
    expect(fn).toHaveBeenCalledTimes(2);
    const axles = fn.mock.calls.map((c) => c[1]).sort();
    expect(axles).toEqual(['front', 'rear']);
  });

  it('uses the values returned by tireFn as the lateral forces', () => {
    // Constant-force tire: regardless of slip, return ±100 N. The vehicle
    // should immediately develop a non-zero vy/yawRate even from rest, since
    // the tire force is not zero at zero slip.
    const v = new BicycleVehicle({
      tireFn: (_slip, axle) => (axle === 'front' ? 100 : -100),
    });
    v.step(SIM_DT, NEUTRAL);
    // vy_dot = (100 + -100)/m = 0 — net lateral force cancels.
    // r_dot = (a*100 - b*-100)/Iz > 0 — pure yaw moment, vehicle starts rotating.
    expect(v.state.vy).toBeCloseTo(0, 12);
    expect(v.state.yawRate).toBeGreaterThan(0);
  });
});

describe('BicycleVehicle — reset and validation', () => {
  it('reset returns to neutral state with optional overrides', () => {
    const v = new BicycleVehicle();
    for (let i = 0; i < 100; i += 1) v.step(SIM_DT, FULL_THROTTLE);
    v.reset({ x: 5, vx: 10 });
    expect(v.state.x).toBe(5);
    expect(v.state.vx).toBe(10);
    expect(v.state.vy).toBe(0);
    expect(v.state.yawRate).toBe(0);
  });

  it('rejects invalid dt', () => {
    const v = new BicycleVehicle();
    expect(() => v.step(0, NEUTRAL)).toThrow();
    expect(() => v.step(-1, NEUTRAL)).toThrow();
    expect(() => v.step(Number.NaN, NEUTRAL)).toThrow();
  });
});
