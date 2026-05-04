import { describe, expect, it } from 'vitest';
import { SIM_DT, SimClock } from './clock.js';
import { FixedStepLoop, type SimStep } from './loop.js';

function captureSteps(): { events: SimStep[]; loop: FixedStepLoop } {
  const events: SimStep[] = [];
  const loop = new FixedStepLoop({
    onStep: (s) => {
      events.push({ dt: s.dt, time: s.time, step: s.step });
    },
    clock: new SimClock(),
  });
  return { events, loop };
}

describe('FixedStepLoop', () => {
  it('emits exactly one event per step()', () => {
    const { events, loop } = captureSteps();
    loop.step();
    loop.step();
    loop.step();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.step)).toEqual([0, 1, 2]);
    expect(events.every((e) => e.dt === SIM_DT)).toBe(true);
  });

  it('stepN runs exactly n steps', () => {
    const { events, loop } = captureSteps();
    loop.stepN(100);
    expect(events).toHaveLength(100);
    expect(events.at(-1)?.step).toBe(99);
    expect(loop.simClock.step).toBe(100);
  });

  it('runs multiple sim steps when real time exceeds one timestep', () => {
    const { events, loop } = captureSteps();
    // 10 ms == ~2.4 steps at 240 Hz: expect 2 steps, residual ~ 0.4 * SIM_DT.
    const stepped = loop.advanceRealTime(0.01);
    expect(stepped).toBe(Math.floor(0.01 / SIM_DT));
    expect(events.length).toBe(stepped);
    expect(loop.accumulatedRemainder).toBeGreaterThanOrEqual(0);
    expect(loop.accumulatedRemainder).toBeLessThan(SIM_DT);
  });

  it('catches up after a stall (no skipped steps)', () => {
    const { events, loop } = captureSteps();
    // 100 ms == 24 steps at 240 Hz: simulate a long delay.
    loop.advanceRealTime(0.1);
    expect(events.length).toBe(24);
    expect(events.map((e) => e.step)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('retains sub-step residual across calls', () => {
    const { events, loop } = captureSteps();
    // Two short calls that together cross a step boundary.
    loop.advanceRealTime(SIM_DT * 0.6);
    expect(events).toHaveLength(0);
    loop.advanceRealTime(SIM_DT * 0.6);
    expect(events).toHaveLength(1);
  });

  it('throws on invalid stepN inputs', () => {
    const { loop } = captureSteps();
    expect(() => loop.stepN(-1)).toThrow();
    expect(() => loop.stepN(Number.NaN)).toThrow();
  });

  it('throws on invalid advanceRealTime inputs', () => {
    const { loop } = captureSteps();
    expect(() => loop.advanceRealTime(-1)).toThrow();
    expect(() => loop.advanceRealTime(Number.POSITIVE_INFINITY)).toThrow();
  });
});
