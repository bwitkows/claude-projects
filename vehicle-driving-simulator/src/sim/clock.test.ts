import { describe, expect, it } from 'vitest';
import { SIM_DT, SIM_HZ, SimClock } from './clock.js';

describe('SimClock', () => {
  it('advances exactly one step per advance() call', () => {
    const c = new SimClock();
    expect(c.step).toBe(0);
    expect(c.time).toBe(0);
    c.advance();
    expect(c.step).toBe(1);
    expect(c.time).toBe(SIM_DT);
  });

  it('reports time as step * SIM_DT exactly', () => {
    const c = new SimClock();
    for (let i = 0; i < 1000; i += 1) c.advance();
    expect(c.step).toBe(1000);
    expect(c.time).toBe(1000 * SIM_DT);
  });

  it('exposes 240 Hz default', () => {
    expect(SIM_HZ).toBe(240);
    expect(SIM_DT).toBe(1 / 240);
  });

  it('reset returns to zero', () => {
    const c = new SimClock();
    c.advance();
    c.advance();
    c.reset();
    expect(c.step).toBe(0);
    expect(c.time).toBe(0);
  });
});
