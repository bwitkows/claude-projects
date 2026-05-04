import type { TelemetryBuffer } from './buffer.js';
import { recordFields, type TelemetryRecord } from './schema.js';

// Numbers serialized with enough precision to round-trip a float64.
// Number.prototype.toString in V8 already emits the shortest round-trip
// representation, but we explicitly use it to be unambiguous.
function fmt(n: number): string {
  if (!Number.isFinite(n)) return n === Number.POSITIVE_INFINITY ? 'Infinity' : 'NaN';
  return n.toString();
}

export function exportCsv(buffer: TelemetryBuffer): string {
  const records = buffer.toArray();
  if (records.length === 0) {
    // Header-only: use the base schema for the empty case.
    return 't,step\n';
  }
  // Field order is determined from the first record; later records that
  // contain unknown fields are written with empty cells in those columns.
  // Within a single build the schema is stable, so this collapses to a
  // simple "first record's fields" header.
  const fields = recordFields(records[0] as TelemetryRecord);
  const header = fields.join(',');
  const rows = records.map((r) => fields.map((f) => (f in r ? fmt(r[f] as number) : '')).join(','));
  return `${header}\n${rows.join('\n')}\n`;
}
