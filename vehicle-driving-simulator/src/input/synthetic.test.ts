import { describe, expect, it } from 'vitest';
import { SyntheticInputSource } from './synthetic.js';
import { NEUTRAL_CONTROL } from './types.js';

describe('SyntheticInputSource', () => {
  it('returns neutral before any event', () => {
    const src = new SyntheticInputSource([{ t: 1, state: { throttle: 1, brake: 0, steer: 0 } }]);
    expect(src.read(0)).toEqual(NEUTRAL_CONTROL);
    expect(src.read(0.5)).toEqual(NEUTRAL_CONTROL);
  });

  it('returns the latest event whose timestamp <= simTime', () => {
    const src = new SyntheticInputSource([
      { t: 0, state: { throttle: 0, brake: 0, steer: 0 } },
      { t: 1, state: { throttle: 1, brake: 0, steer: 0 } },
      { t: 2, state: { throttle: 0.5, brake: 0, steer: 0.5 } },
    ]);
    expect(src.read(0.5).throttle).toBe(0);
    expect(src.read(1.0).throttle).toBe(1);
    expect(src.read(1.999).throttle).toBe(1);
    expect(src.read(2.0).throttle).toBe(0.5);
    expect(src.read(10).steer).toBe(0.5);
  });

  it('is robust to unordered input', () => {
    const src = new SyntheticInputSource([
      { t: 2, state: { throttle: 0.2, brake: 0, steer: 0 } },
      { t: 0, state: { throttle: 0, brake: 0, steer: 0 } },
      { t: 1, state: { throttle: 0.1, brake: 0, steer: 0 } },
    ]);
    expect(src.read(1).throttle).toBe(0.1);
    expect(src.read(2).throttle).toBe(0.2);
  });
});
