import type RAPIER from '@dimforge/rapier3d-compat';
import { SyntheticInputSource } from '../input/synthetic.js';
import { addTerrainCollider, createPhysicsWorld, ensureRapierReady } from '../physics/index.js';
import { SIM_DT } from '../sim/clock.js';
import { Heightmap } from '../terrain/index.js';
import type { FourWheelVehicleState, VehicleModel } from '../vehicle/types.js';
import type { Checkpoint, RunRecording } from './format.js';

export type VehicleFactory = (deps: { world: RAPIER.World; terrain: Heightmap }) => VehicleModel;

export interface ReplayTolerances {
  readonly body: number;
  readonly wheel: number;
}

export const DEFAULT_TOLERANCES: ReplayTolerances = Object.freeze({
  body: 1e-7,
  wheel: 1e-5,
});

export interface CheckpointResult {
  readonly step: number;
  readonly maxBodyDiff: number;
  readonly maxWheelDiff: number;
  readonly bodyOk: boolean;
  readonly wheelOk: boolean;
  readonly worstBodyField: string;
  readonly worstWheelField: string;
}

export interface ReplayResult {
  readonly ok: boolean;
  readonly checkpointResults: readonly CheckpointResult[];
  readonly finalDiff: { readonly maxBodyDiff: number; readonly maxWheelDiff: number };
  readonly tolerances: ReplayTolerances;
}

const BODY_FIELDS = [
  'x',
  'z',
  'heading',
  'speed',
  'vx',
  'vy',
  'yawRate',
  'slipF',
  'slipR',
] as const;

const WHEEL_FIELDS = ['fz', 'slip', 'compression'] as const;
const WHEEL_IDS = ['fl', 'fr', 'rl', 'rr'] as const;

function compareCheckpoint(
  state: FourWheelVehicleState,
  cp: Checkpoint,
): {
  maxBodyDiff: number;
  maxWheelDiff: number;
  worstBodyField: string;
  worstWheelField: string;
} {
  let maxBody = 0;
  let worstBody = '';
  for (const f of BODY_FIELDS) {
    const d = Math.abs(state[f] - cp.state[f]);
    if (d > maxBody) {
      maxBody = d;
      worstBody = f;
    }
  }
  let maxWheel = 0;
  let worstWheel = '';
  for (const wid of WHEEL_IDS) {
    for (const f of WHEEL_FIELDS) {
      const d = Math.abs(state.wheels[wid][f] - cp.wheels[wid][f]);
      if (d > maxWheel) {
        maxWheel = d;
        worstWheel = `${wid}.${f}`;
      }
    }
  }
  return {
    maxBodyDiff: maxBody,
    maxWheelDiff: maxWheel,
    worstBodyField: worstBody,
    worstWheelField: worstWheel,
  };
}

// Drives a fresh vehicle through the recorded events and compares per-step
// state against the recording's checkpoints. Returns per-checkpoint divergence
// numbers and an overall pass/fail. The factory pattern lets the caller swap
// in any VehicleModel implementation; the regression test passes a
// FourWheelVehicle factory.
export async function replayRun(
  recording: RunRecording,
  factory: VehicleFactory,
  opts: { tolerances?: Partial<ReplayTolerances> } = {},
): Promise<ReplayResult> {
  const tolerances: ReplayTolerances = {
    body: opts.tolerances?.body ?? DEFAULT_TOLERANCES.body,
    wheel: opts.tolerances?.wheel ?? DEFAULT_TOLERANCES.wheel,
  };

  await ensureRapierReady();
  const phys = await createPhysicsWorld({ fixedDt: SIM_DT, includeGroundPlane: false });
  const heightmap = new Heightmap();
  addTerrainCollider(phys.world, heightmap);
  // Warmup step so Rapier's broad phase indexes the trimesh before raycasts.
  phys.step();

  const vehicle = factory({ world: phys.world, terrain: heightmap });
  vehicle.reset({
    x: recording.initial.x,
    z: recording.initial.z,
    heading: recording.initial.heading,
  });

  const inputSource = new SyntheticInputSource(recording.events);
  const checkpointMap = new Map<number, Checkpoint>();
  for (const cp of recording.checkpoints) {
    checkpointMap.set(cp.step, cp);
  }
  checkpointMap.set(recording.final.step, recording.final);

  const checkpointResults: CheckpointResult[] = [];
  const totalSteps = recording.final.step;

  for (let i = 0; i <= totalSteps; i += 1) {
    const t = i * SIM_DT;
    const cp = checkpointMap.get(i);
    if (cp) {
      const cmp = compareCheckpoint(vehicle.state as FourWheelVehicleState, cp);
      checkpointResults.push({
        step: i,
        maxBodyDiff: cmp.maxBodyDiff,
        maxWheelDiff: cmp.maxWheelDiff,
        worstBodyField: cmp.worstBodyField,
        worstWheelField: cmp.worstWheelField,
        bodyOk: cmp.maxBodyDiff <= tolerances.body,
        wheelOk: cmp.maxWheelDiff <= tolerances.wheel,
      });
    }
    if (i === totalSteps) break;
    const control = inputSource.read(t);
    vehicle.step(SIM_DT, control);
    phys.step();
  }

  phys.free();

  const ok = checkpointResults.every((r) => r.bodyOk && r.wheelOk);
  const last = checkpointResults[checkpointResults.length - 1];
  return {
    ok,
    checkpointResults,
    finalDiff: {
      maxBodyDiff: last?.maxBodyDiff ?? 0,
      maxWheelDiff: last?.maxWheelDiff ?? 0,
    },
    tolerances,
  };
}
