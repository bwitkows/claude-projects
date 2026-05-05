// Golden-fixture regression test. Loads `fixtures/r7-golden.json` and
// replays it against the current `FourWheelVehicle`. Failure prints
// per-checkpoint divergence numbers so a regression is debuggable.
//
// To regenerate the fixture (e.g., after intentional R7 dynamics changes),
// set the env var `GENERATE_GOLDEN=1` before running tests:
//   PowerShell:  $env:GENERATE_GOLDEN='1'; npm test
//   bash:        GENERATE_GOLDEN=1 npm test
// The test then writes the freshly recorded run to `fixtures/r7-golden.json`
// and asserts replay still passes (sanity).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addTerrainCollider, createPhysicsWorld, ensureRapierReady } from '../physics/index.js';
import { SIM_DT } from '../sim/clock.js';
import { Recorder, serializeRecording } from '../telemetry/index.js';
import { Heightmap } from '../terrain/index.js';
import { FourWheelVehicle } from '../vehicle/four-wheel.js';
import type { RunRecording } from './format.js';
import { replayRun } from './player.js';

const FIXTURE_PATH = path.resolve(process.cwd(), 'fixtures', 'r7-golden.json');

// Five-second deterministic control script: 1 s each of throttle, throttle+
// steer right, throttle+steer left, brake, neutral. 240 Hz × 5 s = 1200 sim
// steps total. Checkpoint every 60 steps → ~21 checkpoints.
const SCRIPT = [
  { fromStep: 0, control: { throttle: 1, brake: 0, steer: 0 } },
  { fromStep: 240, control: { throttle: 1, brake: 0, steer: 0.5 } },
  { fromStep: 480, control: { throttle: 1, brake: 0, steer: -0.5 } },
  { fromStep: 720, control: { throttle: 0, brake: 1, steer: 0 } },
  { fromStep: 960, control: { throttle: 0, brake: 0, steer: 0 } },
];
const TOTAL_STEPS = 1200;

async function recordGoldenRun(): Promise<RunRecording> {
  await ensureRapierReady();
  const phys = await createPhysicsWorld({ fixedDt: SIM_DT, includeGroundPlane: false });
  const terrain = new Heightmap();
  addTerrainCollider(phys.world, terrain);
  phys.step();
  const vehicle = new FourWheelVehicle({ world: phys.world, terrain });
  const recorder = new Recorder({
    rung: 'R7',
    vehicle: 'FourWheelVehicle',
    checkpointInterval: 60,
  });
  recorder.start({ x: 0, z: 0, heading: 0 });
  for (let i = 0; i < TOTAL_STEPS; i += 1) {
    let phase = SCRIPT[0]!;
    for (const p of SCRIPT) {
      if (p.fromStep <= i) phase = p;
    }
    const step = { dt: SIM_DT, step: i, time: i * SIM_DT };
    recorder.observe(step, phase.control, vehicle.state);
    vehicle.step(SIM_DT, phase.control);
    phys.step();
  }
  const finalStep = { dt: SIM_DT, step: TOTAL_STEPS, time: TOTAL_STEPS * SIM_DT };
  const recording = recorder.stop(finalStep, vehicle.state);
  phys.free();
  return recording;
}

describe('Golden fixture (R7)', () => {
  it('replays without regression', async () => {
    if (process.env.GENERATE_GOLDEN === '1') {
      // Regenerate path. Drives a fresh vehicle, records, writes fixture.
      const recording = await recordGoldenRun();
      const dir = path.dirname(FIXTURE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, serializeRecording(recording), 'utf-8');
      console.log(`Wrote ${FIXTURE_PATH} (${recording.checkpoints.length} checkpoints)`);
    }

    if (!fs.existsSync(FIXTURE_PATH)) {
      throw new Error(
        `Golden fixture not found at ${FIXTURE_PATH}. Run with GENERATE_GOLDEN=1 to create it.`,
      );
    }

    const text = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const recording = JSON.parse(text) as RunRecording;
    expect(recording.version).toBe(1);
    expect(recording.rung).toBe('R7');

    const result = await replayRun(recording, ({ world, terrain }) => {
      return new FourWheelVehicle({ world, terrain });
    });

    if (!result.ok) {
      console.log('Regression detected. Per-checkpoint divergence:');
      for (const cp of result.checkpointResults) {
        if (!cp.bodyOk || !cp.wheelOk) {
          console.log(
            `  step ${cp.step}: body ${cp.maxBodyDiff.toExponential(2)} (worst: ${cp.worstBodyField}), wheel ${cp.maxWheelDiff.toExponential(2)} (worst: ${cp.worstWheelField})`,
          );
        }
      }
    }

    expect(result.ok).toBe(true);
  });
});
