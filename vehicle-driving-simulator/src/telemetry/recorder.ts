import type { ControlState } from '../input/types.js';
import {
  type Checkpoint,
  type CheckpointWheels,
  RECORDING_VERSION,
  type RecordingEvent,
  type RecordingInitial,
  type RunRecording,
} from '../replay/format.js';
import type { SimStep } from '../sim/loop.js';
import type { FourWheelVehicleState } from '../vehicle/types.js';

export interface RecorderOptions {
  readonly checkpointInterval?: number;
  readonly rung: string;
  readonly lockfileSha256?: string;
  readonly deps?: Readonly<Record<string, string>>;
  readonly vehicle: RecordingInitial['vehicle'];
}

const DEFAULT_CHECKPOINT_INTERVAL = 60;

function snapshotCheckpoint(step: SimStep, state: FourWheelVehicleState): Checkpoint {
  const w = state.wheels;
  const wheels: CheckpointWheels = {
    fl: { fz: w.fl.fz, slip: w.fl.slip, compression: w.fl.compression },
    fr: { fz: w.fr.fz, slip: w.fr.slip, compression: w.fr.compression },
    rl: { fz: w.rl.fz, slip: w.rl.slip, compression: w.rl.compression },
    rr: { fz: w.rr.fz, slip: w.rr.slip, compression: w.rr.compression },
  };
  return {
    step: step.step,
    time: step.time,
    state: {
      x: state.x,
      z: state.z,
      heading: state.heading,
      speed: state.speed,
      vx: state.vx,
      vy: state.vy,
      yawRate: state.yawRate,
      slipF: state.slipF,
      slipR: state.slipR,
    },
    wheels,
  };
}

function controlEqual(a: ControlState, b: ControlState): boolean {
  return a.throttle === b.throttle && a.brake === b.brake && a.steer === b.steer;
}

// Captures a deterministic vehicle session into a `RunRecording`. Events are
// debounced (only emitted when ControlState actually changes); checkpoints
// emit at a regular sim-step interval. Coexists with R0's TelemetryBuffer —
// both can subscribe to the app's `onStep` independently.
export class Recorder {
  private readonly opts: Required<Omit<RecorderOptions, 'lockfileSha256' | 'deps'>> & {
    readonly lockfileSha256: string;
    readonly deps: Readonly<Record<string, string>>;
  };
  private running = false;
  private events: RecordingEvent[] = [];
  private checkpoints: Checkpoint[] = [];
  private final: Checkpoint | null = null;
  private lastEmittedState: ControlState | null = null;
  private initial: RecordingInitial | null = null;
  private startedAt: string | null = null;

  constructor(opts: RecorderOptions) {
    this.opts = {
      checkpointInterval: opts.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL,
      rung: opts.rung,
      vehicle: opts.vehicle,
      lockfileSha256: opts.lockfileSha256 ?? '',
      deps: opts.deps ?? {},
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  // Begins recording from the supplied initial pose. Subsequent `observe`
  // calls accumulate events + checkpoints. Calling `start` again resets.
  start(initialPose: { x: number; z: number; heading: number }): void {
    this.running = true;
    this.events = [];
    this.checkpoints = [];
    this.final = null;
    this.lastEmittedState = null;
    this.initial = {
      vehicle: this.opts.vehicle,
      x: initialPose.x,
      z: initialPose.z,
      heading: initialPose.heading,
    };
    this.startedAt = new Date().toISOString();
  }

  // Called from the app's onStep (or a test driver) once per sim step. The
  // recorder decides whether to emit an event and/or a checkpoint.
  observe(step: SimStep, input: ControlState, vehicleState: FourWheelVehicleState): void {
    if (!this.running) return;
    if (this.lastEmittedState === null || !controlEqual(this.lastEmittedState, input)) {
      this.events.push({ t: step.time, state: { ...input } });
      this.lastEmittedState = { ...input };
    }
    if (step.step % this.opts.checkpointInterval === 0) {
      this.checkpoints.push(snapshotCheckpoint(step, vehicleState));
    }
  }

  // Stops recording; returns the assembled `RunRecording` ready for serialization.
  stop(finalStep: SimStep, finalState: FourWheelVehicleState): RunRecording {
    if (!this.running) {
      throw new Error('Recorder.stop: not running');
    }
    this.final = snapshotCheckpoint(finalStep, finalState);
    this.running = false;
    return this.recording();
  }

  // Returns the current in-memory recording. May be called while running to
  // peek (the `final` checkpoint is the last full snapshot, possibly stale).
  recording(): RunRecording {
    if (this.initial === null) {
      throw new Error('Recorder.recording: never started');
    }
    const finalCp =
      this.final ??
      this.checkpoints[this.checkpoints.length - 1] ??
      ({
        step: 0,
        time: 0,
        state: {
          x: this.initial.x,
          z: this.initial.z,
          heading: this.initial.heading,
          speed: 0,
          vx: 0,
          vy: 0,
          yawRate: 0,
          slipF: 0,
          slipR: 0,
        },
        wheels: {
          fl: { fz: 0, slip: 0, compression: 0 },
          fr: { fz: 0, slip: 0, compression: 0 },
          rl: { fz: 0, slip: 0, compression: 0 },
          rr: { fz: 0, slip: 0, compression: 0 },
        },
      } satisfies Checkpoint);
    return {
      version: RECORDING_VERSION,
      rung: this.opts.rung,
      recordedAt: this.startedAt ?? new Date().toISOString(),
      lockfileSha256: this.opts.lockfileSha256,
      deps: this.opts.deps,
      initial: this.initial,
      events: [...this.events],
      checkpoints: [...this.checkpoints],
      final: finalCp,
    };
  }

  // Number of events / checkpoints captured so far — useful for tests.
  get eventCount(): number {
    return this.events.length;
  }
  get checkpointCount(): number {
    return this.checkpoints.length;
  }
}

export function recordRun(opts: RecorderOptions): Recorder {
  return new Recorder(opts);
}
