import { describe, expect, it } from 'vitest';
import { addTerrainCollider, createPhysicsWorld, ensureRapierReady } from '../physics/index.js';
import { SIM_DT } from '../sim/clock.js';
import { Recorder, serializeRecording } from '../telemetry/index.js';
import { Heightmap } from '../terrain/index.js';
import { FourWheelVehicle } from '../vehicle/four-wheel.js';
import type { RunRecording } from './format.js';
import { replayRun } from './player.js';

interface RecordedRun {
  readonly recording: RunRecording;
  readonly totalSteps: number;
}

const SCRIPT = [
  { fromStep: 0, control: { throttle: 1, brake: 0, steer: 0 } },
  { fromStep: 60, control: { throttle: 1, brake: 0, steer: 0.5 } },
  { fromStep: 120, control: { throttle: 1, brake: 0, steer: -0.5 } },
  { fromStep: 180, control: { throttle: 0, brake: 1, steer: 0 } },
];

async function runAndRecord(): Promise<RecordedRun> {
  await ensureRapierReady();
  const phys = await createPhysicsWorld({ fixedDt: SIM_DT, includeGroundPlane: false });
  const terrain = new Heightmap();
  addTerrainCollider(phys.world, terrain);
  phys.step();
  const vehicle = new FourWheelVehicle({ world: phys.world, terrain });
  const recorder = new Recorder({
    rung: 'R7',
    vehicle: 'FourWheelVehicle',
    checkpointInterval: 30,
  });
  recorder.start({ x: 0, z: 0, heading: 0 });
  const totalSteps = 240;
  for (let i = 0; i < totalSteps; i += 1) {
    const t = i * SIM_DT;
    let phase = SCRIPT[0]!;
    for (const p of SCRIPT) {
      if (p.fromStep <= i) phase = p;
    }
    const ctrl = phase.control;
    recorder.observe({ dt: SIM_DT, step: i, time: t }, ctrl, vehicle.state);
    vehicle.step(SIM_DT, ctrl);
    phys.step();
  }
  const finalStep = { dt: SIM_DT, step: totalSteps, time: totalSteps * SIM_DT };
  const recording = recorder.stop(finalStep, vehicle.state);
  phys.free();
  return { recording, totalSteps };
}

describe('Recorder', () => {
  it('debounces — repeated identical control states emit one event', async () => {
    const { recording } = await runAndRecord();
    // Script has 4 distinct control states. Recorder should emit at most 4
    // events (start state + each transition). The first observe always
    // emits since lastEmittedState starts null.
    expect(recording.events.length).toBeLessThanOrEqual(SCRIPT.length);
    expect(recording.events.length).toBeGreaterThanOrEqual(SCRIPT.length);
  });

  it('emits checkpoints at the configured interval (every 30 steps over 240)', async () => {
    const { recording } = await runAndRecord();
    // Expected: steps 0, 30, 60, 90, 120, 150, 180, 210 (≥8 checkpoints).
    expect(recording.checkpoints.length).toBeGreaterThanOrEqual(8);
    // Final checkpoint is separate.
    expect(recording.final.step).toBe(240);
  });

  it('serialized output round-trips through JSON without numeric loss', async () => {
    const { recording } = await runAndRecord();
    const json = serializeRecording(recording);
    const parsed = JSON.parse(json) as RunRecording;
    expect(parsed.version).toBe(recording.version);
    expect(parsed.events.length).toBe(recording.events.length);
    expect(parsed.checkpoints.length).toBe(recording.checkpoints.length);
    // Numeric round-trip: every checkpoint's body field must equal exactly.
    for (let i = 0; i < recording.checkpoints.length; i += 1) {
      const a = recording.checkpoints[i]!;
      const b = parsed.checkpoints[i]!;
      expect(b.state.x).toBe(a.state.x);
      expect(b.state.heading).toBe(a.state.heading);
      expect(b.wheels.fl.fz).toBe(a.wheels.fl.fz);
      expect(b.wheels.rr.compression).toBe(a.wheels.rr.compression);
    }
  });
});

describe('replayRun', () => {
  it('reproduces every checkpoint within default tolerances', async () => {
    const { recording } = await runAndRecord();
    const result = await replayRun(recording, ({ world, terrain }) => {
      return new FourWheelVehicle({ world, terrain });
    });
    expect(result.ok).toBe(true);
    for (const cp of result.checkpointResults) {
      expect(cp.bodyOk).toBe(true);
      expect(cp.wheelOk).toBe(true);
    }
    // All checkpoints covered (8 interval + 1 final = 9, possibly more).
    expect(result.checkpointResults.length).toBeGreaterThanOrEqual(9);
  });

  it('detects perturbation — a vehicle with different fDrive diverges from the recording', async () => {
    const { recording } = await runAndRecord();
    // Perturb the drive force by 10% — replay should diverge meaningfully
    // from the original recording's checkpoints.
    const result = await replayRun(recording, ({ world, terrain }) => {
      return new FourWheelVehicle({ world, terrain, params: { fDrive: 9000 * 1.1 } });
    });
    expect(result.ok).toBe(false);
    // Final divergence should be substantial (not just float noise) given
    // the 10% force perturbation accumulated over 240 sim steps.
    expect(result.finalDiff.maxBodyDiff).toBeGreaterThan(0.01);
  });

  it('replays with custom tolerances — looser tolerance overrides default', async () => {
    const { recording } = await runAndRecord();
    const result = await replayRun(
      recording,
      ({ world, terrain }) => new FourWheelVehicle({ world, terrain }),
      { tolerances: { body: 1, wheel: 1 } },
    );
    // With huge tolerances, replay always passes.
    expect(result.ok).toBe(true);
    expect(result.tolerances.body).toBe(1);
    expect(result.tolerances.wheel).toBe(1);
  });
});
