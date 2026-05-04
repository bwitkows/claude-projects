import { describe, expect, it } from 'vitest';
import { SyntheticInputSource } from '../input/synthetic.js';
import type { ControlState } from '../input/types.js';
import { SIM_DT } from '../sim/clock.js';
import { DEFAULT_KINEMATIC_PARAMS, KinematicVehicle } from './kinematic.js';

const NEUTRAL: ControlState = { throttle: 0, brake: 0, steer: 0 };
const FULL_THROTTLE: ControlState = { throttle: 1, brake: 0, steer: 0 };

describe('KinematicVehicle — forward motion', () => {
  it('accelerates from rest under full throttle, no lateral drift', () => {
    const v = new KinematicVehicle();
    for (let i = 0; i < 240; i += 1) v.step(SIM_DT, FULL_THROTTLE);
    expect(v.state.speed).toBeGreaterThan(5);
    expect(v.state.speed).toBeLessThanOrEqual(DEFAULT_KINEMATIC_PARAMS.vMax);
    expect(v.state.z).toBeGreaterThan(0);
    expect(Math.abs(v.state.x)).toBeLessThan(1e-9);
    expect(Math.abs(v.state.heading)).toBeLessThan(1e-9);
  });

  it('saturates at vMax under sustained throttle', () => {
    const v = new KinematicVehicle();
    // 10 sim seconds is well past the time needed to reach vMax with aMax=6.
    for (let i = 0; i < 240 * 10; i += 1) v.step(SIM_DT, FULL_THROTTLE);
    expect(v.state.speed).toBeGreaterThan(DEFAULT_KINEMATIC_PARAMS.vMax - 0.5);
    expect(v.state.speed).toBeLessThanOrEqual(DEFAULT_KINEMATIC_PARAMS.vMax);
  });
});

describe('KinematicVehicle — steering', () => {
  it('does not yaw when stationary even at full lock', () => {
    const v = new KinematicVehicle();
    const ctrl: ControlState = { throttle: 0, brake: 0, steer: 1 };
    for (let i = 0; i < 240; i += 1) v.step(SIM_DT, ctrl);
    expect(Math.abs(v.state.heading)).toBeLessThan(1e-9);
    expect(v.state.speed).toBe(0);
  });

  it('yaws once moving above half vMax', () => {
    const v = new KinematicVehicle();
    // First throttle up until we cross vMax/2; aMax=6 → ~2s for half speed.
    let stepsToHalf = 0;
    while (v.state.speed < DEFAULT_KINEMATIC_PARAMS.vMax / 2 && stepsToHalf < 240 * 5) {
      v.step(SIM_DT, FULL_THROTTLE);
      stepsToHalf += 1;
    }
    expect(v.state.speed).toBeGreaterThan(DEFAULT_KINEMATIC_PARAMS.vMax / 2);
    const headingBefore = v.state.heading;
    const ctrl: ControlState = { throttle: 1, brake: 0, steer: 1 };
    for (let i = 0; i < 60; i += 1) v.step(SIM_DT, ctrl);
    expect(v.state.heading - headingBefore).toBeGreaterThan(0.05);
    // Vehicle is still moving while turning.
    expect(Math.abs(v.state.x) + Math.abs(v.state.z)).toBeGreaterThan(0);
  });
});

describe('KinematicVehicle — brake', () => {
  it('brakes to zero and never goes negative', () => {
    const v = new KinematicVehicle({}, { speed: 10 });
    const ctrl: ControlState = { throttle: 0, brake: 1, steer: 0 };
    let reachedZero = false;
    for (let i = 0; i < 240 * 5; i += 1) {
      v.step(SIM_DT, ctrl);
      expect(v.state.speed).toBeGreaterThanOrEqual(0);
      if (v.state.speed === 0) {
        reachedZero = true;
        break;
      }
    }
    expect(reachedZero).toBe(true);
  });
});

describe('KinematicVehicle — coast drag', () => {
  it('coasts to a stop in finite time under neutral controls', () => {
    const v = new KinematicVehicle({}, { speed: 5 });
    for (let i = 0; i < 240 * 30; i += 1) v.step(SIM_DT, NEUTRAL);
    expect(v.state.speed).toBe(0);
  });
});

describe('KinematicVehicle — closed-form integration', () => {
  // Compares the implementation against an in-test reimplementation of the
  // same formulas. If the implementation drifts, this test catches it.
  it('matches a parallel reference implementation step-for-step', () => {
    const veh = new KinematicVehicle();
    const p = DEFAULT_KINEMATIC_PARAMS;
    let x = 0;
    let z = 0;
    let heading = 0;
    let speed = 0;

    const seq: ControlState[] = [];
    for (let i = 0; i < 60; i += 1) seq.push({ throttle: 1, brake: 0, steer: 0 });
    for (let i = 0; i < 60; i += 1) seq.push({ throttle: 1, brake: 0, steer: 0.5 });
    for (let i = 0; i < 60; i += 1) seq.push({ throttle: 0, brake: 1, steer: 0 });

    for (const ctrl of seq) {
      veh.step(SIM_DT, ctrl);
      const desired = ctrl.throttle * p.vMax;
      const dv = Math.max(-p.aMax * SIM_DT, Math.min(p.aMax * SIM_DT, desired - speed));
      speed += dv;
      speed = Math.max(0, speed - ctrl.brake * p.brakeDecel * SIM_DT);
      speed = Math.max(0, speed - p.drag * SIM_DT);
      speed = Math.min(p.vMax, speed);
      const yaw = ctrl.steer * p.yawRateAtVMax * (speed / p.vMax);
      heading += yaw * SIM_DT;
      x += speed * Math.sin(heading) * SIM_DT;
      z += speed * Math.cos(heading) * SIM_DT;

      expect(Math.abs(veh.state.x - x)).toBeLessThan(1e-12);
      expect(Math.abs(veh.state.z - z)).toBeLessThan(1e-12);
      expect(Math.abs(veh.state.heading - heading)).toBeLessThan(1e-12);
      expect(Math.abs(veh.state.speed - speed)).toBeLessThan(1e-12);
    }
  });
});

describe('KinematicVehicle — replay equivalence', () => {
  it('two instances driven by the same SyntheticInputSource match within 1e-8', () => {
    const events = [
      { t: 0, state: { throttle: 1, brake: 0, steer: 0 } },
      { t: 0.5, state: { throttle: 1, brake: 0, steer: 0.7 } },
      { t: 0.75, state: { throttle: 1, brake: 0, steer: -0.7 } },
      { t: 1.0, state: { throttle: 0, brake: 1, steer: 0 } },
    ];
    const a = new KinematicVehicle();
    const b = new KinematicVehicle();
    const srcA = new SyntheticInputSource(events);
    const srcB = new SyntheticInputSource(events);
    for (let i = 0; i < 240; i += 1) {
      const t = i * SIM_DT;
      a.step(SIM_DT, srcA.read(t));
      b.step(SIM_DT, srcB.read(t));
      expect(Math.abs(a.state.x - b.state.x)).toBeLessThan(1e-8);
      expect(Math.abs(a.state.z - b.state.z)).toBeLessThan(1e-8);
      expect(Math.abs(a.state.heading - b.state.heading)).toBeLessThan(1e-8);
      expect(Math.abs(a.state.speed - b.state.speed)).toBeLessThan(1e-8);
    }
  });
});

describe('KinematicVehicle — reset', () => {
  it('restores initial state with optional overrides', () => {
    const v = new KinematicVehicle();
    for (let i = 0; i < 100; i += 1) v.step(SIM_DT, FULL_THROTTLE);
    v.reset({ x: 10, heading: Math.PI / 2 });
    expect(v.state.x).toBe(10);
    expect(v.state.z).toBe(0);
    expect(v.state.heading).toBe(Math.PI / 2);
    expect(v.state.speed).toBe(0);
  });

  it('rejects invalid dt', () => {
    const v = new KinematicVehicle();
    expect(() => v.step(0, NEUTRAL)).toThrow();
    expect(() => v.step(-1, NEUTRAL)).toThrow();
    expect(() => v.step(Number.NaN, NEUTRAL)).toThrow();
  });
});
