import { describe, expect, it } from 'vitest';
import { TelemetryBuffer } from './buffer.js';

describe('TelemetryBuffer', () => {
  it('accumulates records up to capacity', () => {
    const b = new TelemetryBuffer(5);
    for (let i = 0; i < 3; i += 1) b.push({ t: i / 240, step: i });
    expect(b.length).toBe(3);
    expect(b.toArray().map((r) => r.step)).toEqual([0, 1, 2]);
  });

  it('drops oldest record once full', () => {
    const b = new TelemetryBuffer(3);
    for (let i = 0; i < 5; i += 1) b.push({ t: i / 240, step: i });
    expect(b.length).toBe(3);
    expect(b.toArray().map((r) => r.step)).toEqual([2, 3, 4]);
  });

  it('returns chronological order', () => {
    const b = new TelemetryBuffer(4);
    for (let i = 0; i < 10; i += 1) b.push({ t: i / 240, step: i });
    expect(b.toArray().map((r) => r.step)).toEqual([6, 7, 8, 9]);
  });

  it('rejects bad capacity', () => {
    expect(() => new TelemetryBuffer(0)).toThrow();
    expect(() => new TelemetryBuffer(Number.NaN)).toThrow();
  });
});
