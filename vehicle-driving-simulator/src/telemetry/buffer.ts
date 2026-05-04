import type { TelemetryRecord } from './schema.js';

export const DEFAULT_CAPACITY = 144_000;

export class TelemetryBuffer {
  private readonly storage: (TelemetryRecord | undefined)[];
  private readonly cap: number;
  private head = 0;
  private size = 0;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (!Number.isFinite(capacity) || capacity < 1) {
      throw new Error(`TelemetryBuffer capacity must be >= 1, got ${capacity}`);
    }
    this.cap = Math.floor(capacity);
    this.storage = new Array(this.cap);
  }

  get capacity(): number {
    return this.cap;
  }

  get length(): number {
    return this.size;
  }

  push(record: TelemetryRecord): void {
    this.storage[this.head] = record;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size += 1;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    for (let i = 0; i < this.cap; i += 1) this.storage[i] = undefined;
  }

  // Returns records in chronological order (oldest first).
  toArray(): TelemetryRecord[] {
    const out: TelemetryRecord[] = [];
    if (this.size === 0) return out;
    const start = this.size < this.cap ? 0 : this.head;
    for (let i = 0; i < this.size; i += 1) {
      const idx = (start + i) % this.cap;
      const rec = this.storage[idx];
      if (rec) out.push(rec);
    }
    return out;
  }
}
