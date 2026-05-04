// The telemetry schema is open for extension. R0 defines only `t` and `step`;
// later capabilities (vehicle-dynamics etc.) will add fields like `vx`, `vy`,
// `slip_f`, `slip_r`. Field order is stable for a given build.
export interface TelemetryRecord {
  readonly t: number;
  readonly step: number;
  readonly [field: string]: number;
}

export const BASE_FIELDS = ['t', 'step'] as const;

export function recordFields(record: TelemetryRecord): string[] {
  // Stable order: declared base fields first, then any extras alphabetically.
  const extras = Object.keys(record)
    .filter((k) => !(BASE_FIELDS as readonly string[]).includes(k))
    .sort();
  return [...BASE_FIELDS, ...extras];
}
