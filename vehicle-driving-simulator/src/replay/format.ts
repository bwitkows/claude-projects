import type { ControlState } from '../input/types.js';

export const RECORDING_VERSION = 1;

// Body-frame state captured at a checkpoint. Mirrors `BicycleVehicleState`'s
// numeric fields. `slipF, slipR` are per-axle averages (R5 semantics).
export interface CheckpointBody {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
  readonly vx: number;
  readonly vy: number;
  readonly yawRate: number;
  readonly slipF: number;
  readonly slipR: number;
}

// Per-wheel state captured at a checkpoint. R6 added `slip`; R7 added
// `compression`. Position is intentionally omitted — it's derivable from
// body pose + body-frame hardpoint offsets and adds noise to the file.
export interface CheckpointWheel {
  readonly fz: number;
  readonly slip: number;
  readonly compression: number;
}

export interface CheckpointWheels {
  readonly fl: CheckpointWheel;
  readonly fr: CheckpointWheel;
  readonly rl: CheckpointWheel;
  readonly rr: CheckpointWheel;
}

export interface Checkpoint {
  readonly step: number;
  readonly time: number;
  readonly state: CheckpointBody;
  readonly wheels: CheckpointWheels;
}

export interface RecordingInitial {
  readonly vehicle: 'FourWheelVehicle' | 'BicycleVehicle' | 'KinematicVehicle';
  readonly params?: Readonly<Record<string, unknown>>;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export interface RecordingEvent {
  readonly t: number;
  readonly state: ControlState;
}

// The on-disk JSON representation of a deterministic vehicle session. The
// format is purposely shallow and self-contained so it round-trips through
// `JSON.parse`/`JSON.stringify` without information loss.
export interface RunRecording {
  readonly version: typeof RECORDING_VERSION;
  readonly rung: string;
  readonly recordedAt: string;
  readonly lockfileSha256: string;
  readonly deps: Readonly<Record<string, string>>;
  readonly initial: RecordingInitial;
  readonly events: readonly RecordingEvent[];
  readonly checkpoints: readonly Checkpoint[];
  readonly final: Checkpoint;
}
