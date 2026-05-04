import { describe, expect, it } from 'vitest';
import { SIM_DT, SimClock } from '../sim/clock.js';
import { FixedStepLoop } from '../sim/loop.js';
import { createPhysicsWorld, rapier } from './world.js';

interface BodySnapshot {
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
}

function snapshot(body: import('@dimforge/rapier3d-compat').RigidBody): BodySnapshot {
  const t = body.translation();
  const r = body.rotation();
  const lin = body.linvel();
  const ang = body.angvel();
  return {
    px: t.x,
    py: t.y,
    pz: t.z,
    qx: r.x,
    qy: r.y,
    qz: r.z,
    qw: r.w,
    vx: lin.x,
    vy: lin.y,
    vz: lin.z,
    ax: ang.x,
    ay: ang.y,
    az: ang.z,
  };
}

async function runSequence(steps: number): Promise<BodySnapshot[]> {
  const phys = await createPhysicsWorld({ fixedDt: SIM_DT });
  const RAPIER = rapier();
  const dyn = phys.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setLinvel(1, 0, 0.5),
  );
  phys.world.createCollider(RAPIER.ColliderDesc.ball(0.5), dyn);

  const loop = new FixedStepLoop({
    onStep: () => phys.step(),
    clock: new SimClock(),
  });

  const snaps: BodySnapshot[] = [];
  for (let i = 0; i < steps; i += 1) {
    loop.step();
    snaps.push(snapshot(dyn));
  }
  phys.free();
  return snaps;
}

describe('Physics replay equivalence', () => {
  it('two runs with identical input yield identical body state within 1e-8', async () => {
    const a = await runSequence(120);
    const b = await runSequence(120);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      const sa = a[i]!;
      const sb = b[i]!;
      for (const key of Object.keys(sa) as (keyof BodySnapshot)[]) {
        expect(Math.abs(sa[key] - sb[key])).toBeLessThan(1e-8);
      }
    }
  });

  it('sim clock advances exactly N * SIM_DT after N physics steps', async () => {
    const phys = await createPhysicsWorld({ fixedDt: SIM_DT });
    const clock = new SimClock();
    const loop = new FixedStepLoop({ onStep: () => phys.step(), clock });
    loop.stepN(50);
    expect(clock.step).toBe(50);
    expect(clock.time).toBe(50 * SIM_DT);
    phys.free();
  });
});
