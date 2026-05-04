import { describe, expect, it } from 'vitest';
import { TelemetryBuffer } from './buffer.js';
import { exportCsv } from './csv.js';

describe('exportCsv', () => {
  it('emits header-only when buffer is empty', () => {
    const b = new TelemetryBuffer(8);
    expect(exportCsv(b)).toBe('t,step\n');
  });

  it('emits header + rows in chronological order', () => {
    const b = new TelemetryBuffer(8);
    b.push({ t: 0, step: 0 });
    b.push({ t: 1 / 240, step: 1 });
    b.push({ t: 2 / 240, step: 2 });
    const csv = exportCsv(b);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('t,step');
    expect(lines[1]).toBe(`0,0`);
    expect(lines[2]).toBe(`${1 / 240},1`);
    expect(lines[3]).toBe(`${2 / 240},2`);
  });

  it('round-trips float64 values via shortest representation', () => {
    const b = new TelemetryBuffer(2);
    const tricky = 0.1 + 0.2;
    b.push({ t: tricky, step: 0 });
    const csv = exportCsv(b);
    const dataRow = csv.trimEnd().split('\n')[1]!;
    const tStr = dataRow.split(',')[0]!;
    expect(Number(tStr)).toBe(tricky);
  });

  it('includes extra fields with stable header order', () => {
    const b = new TelemetryBuffer(2);
    b.push({ t: 0, step: 0, vx: 1.5, vy: -0.25 });
    const csv = exportCsv(b);
    const [header, row] = csv.trimEnd().split('\n');
    expect(header).toBe('t,step,vx,vy');
    expect(row).toBe('0,0,1.5,-0.25');
  });
});
