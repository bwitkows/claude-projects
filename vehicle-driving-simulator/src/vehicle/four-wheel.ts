import RAPIER from '@dimforge/rapier3d-compat';
import type { ControlState } from '../input/types.js';
import type { Heightmap } from '../terrain/index.js';
import { DEFAULT_PACEJKA_PARAMS, PacejkaTireModel, type TireModel } from './tire.js';
import {
  type FourWheelVehicleState,
  NEUTRAL_FOUR_WHEEL_STATE,
  type VehicleModel,
  type VehicleState,
  type WheelState,
} from './types.js';

export type WheelId = 'fl' | 'fr' | 'rl' | 'rr';

export interface FourWheelVehicleParams {
  readonly m: number;
  readonly iz: number; // yaw inertia (kg·m²)
  readonly a: number; // CoG → front axle
  readonly b: number; // CoG → rear axle
  readonly trackWidth: number;
  readonly chassisHeight: number;
  readonly hCog: number; // CoG height above ground (m), used by load transfer
  // R5 NOTE: `cAlpha` (per-axle stiffness, N/rad) is no longer used by the
  // tire force calculation — `tireModel` owns that. It is kept on the params
  // shape for backward construction but is informational only.
  readonly cAlpha: number;
  readonly fDrive: number;
  readonly fBrake: number;
  readonly dragCoef: number;
  readonly deltaMax: number;
  readonly vMax: number;
  readonly vMinSlip: number;
  readonly rideHeight: number; // body Y offset above terrain (m); R7: only used as a fallback initial offset
  readonly wheelMaxRayLen: number; // raycast distance allowance below hardpoint (m)
  readonly wheelRayHover: number; // ray origin offset above hardpoint (m)
  // R5/R6: tire force model. Default is PacejkaTireModel(DEFAULT_PACEJKA_PARAMS)
  // — the saturating Magic Formula. R5's LinearTireModel remains exported and
  // can be passed explicitly for the unbounded linear regime.
  readonly tireModel: TireModel;
  // R7 suspension parameters (per wheel).
  readonly springRestLength: number; // L_0, m
  readonly springStiffness: number; // k, N/m per wheel
  readonly springDamping: number; // c, N·s/m per wheel
  readonly wheelRadius: number; // R_wheel, m — used in the equilibrium-pose calculation
}

export const DEFAULT_FOUR_WHEEL_PARAMS: FourWheelVehicleParams = Object.freeze({
  m: 1500,
  iz: 2500,
  a: 1.2,
  b: 1.4,
  trackWidth: 1.5,
  chassisHeight: 1.0,
  hCog: 0.5,
  cAlpha: 80000,
  fDrive: 9000,
  fBrake: 18000,
  dragCoef: 360,
  deltaMax: 0.524,
  vMax: 25,
  vMinSlip: 0.5,
  rideHeight: 0.5,
  wheelMaxRayLen: 1.5,
  wheelRayHover: 1.0,
  tireModel: new PacejkaTireModel(DEFAULT_PACEJKA_PARAMS),
  // R7 suspension defaults. With m=1500 and four wheels, static load per
  // wheel = 3679 N. Static compression = 3679/70000 = 0.0526 m. Damping ratio
  // c / (2·sqrt(k·m/4)) ≈ 5000 / 10246 ≈ 0.49 — slightly underdamped, gives
  // a small visible settle oscillation rather than a dead landing.
  springRestLength: 0.4,
  springStiffness: 70000,
  // R7 INTERPRETATION: spec design.md proposed c=5000 (~50% of critical
  // damping). At that level, the initial settle from terrain-induced
  // compression asymmetry oscillated long enough to feed numerical drift
  // back into yaw via the slip-angle / lateral-force chain. Bumped to 10000
  // (≈ critical damping per wheel for the sprung mass) so the chassis
  // settles in <0.5 s and yaw stays bounded under neutral input. Real cars
  // with anti-roll bars get away with lower damping; we don't have those.
  springDamping: 10000,
  wheelRadius: 0.35,
});

export interface FourWheelDeps {
  readonly world: RAPIER.World;
  readonly terrain: Heightmap;
  readonly params?: Partial<FourWheelVehicleParams>;
}

interface BodyOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface WheelHardpoints {
  readonly fl: BodyOffset;
  readonly fr: BodyOffset;
  readonly rl: BodyOffset;
  readonly rr: BodyOffset;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Rotates body-frame (bx, by, bz) into world frame for a yaw of `heading`.
// Convention from R1 (and unchanged through R3): heading=0 → body forward = +Z,
// body right = +X. Rotation maps body +Z to (sin h, 0, cos h) and body +X to
// (cos h, 0, -sin h).
function rotateBodyToWorld(
  bx: number,
  by: number,
  bz: number,
  heading: number,
): {
  x: number;
  y: number;
  z: number;
} {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return {
    x: bx * c + bz * s,
    y: by,
    z: -bx * s + bz * c,
  };
}

// Yaw-only quaternion. R1 convention: state.heading = h means body forward
// is at world (sin h, 0, cos h). Rotation R_y(h) — positive h, standard
// math convention — takes (0,0,1) to (sin h, 0, cos h), so the quaternion
// is `q = (0, sin(h/2), 0, cos(h/2))` (positive half-angle).
//
// R7 NOTE (correction): R4–R6 had `half = -heading*0.5` (negative), which
// produced a quaternion that mirrored the body's actual 3D rotation across
// the X-axis from what state.heading implied. This was invisible in R4–R6
// because nothing read the body's full 3D orientation (only state.heading,
// extracted with a matching wrong sign so it round-tripped). R7 uses the
// full quaternion to position wheel hardpoints when pitch/roll are non-zero,
// surfacing the discrepancy. Fixed here; headingFromQuaternion below mirrors.
function quaternionFromHeading(heading: number): { x: number; y: number; z: number; w: number } {
  const half = heading * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

// Rotates body-frame (bx, by, bz) into world frame using the body's full
// quaternion (not just yaw). Required in R7 because pitch and roll are no
// longer locked — wheel hardpoints rotate around all three axes, and applying
// spring/tire forces at yaw-only-computed contact points produces wrong
// torques and destabilizes the body.
function rotateByQuaternion(
  bx: number,
  by: number,
  bz: number,
  q: { x: number; y: number; z: number; w: number },
): { x: number; y: number; z: number } {
  // R · v where R is the rotation matrix derived from quaternion q.
  const xx = q.x * q.x;
  const yy = q.y * q.y;
  const zz = q.z * q.z;
  const xy = q.x * q.y;
  const xz = q.x * q.z;
  const yz = q.y * q.z;
  const wx = q.w * q.x;
  const wy = q.w * q.y;
  const wz = q.w * q.z;
  return {
    x: bx * (1 - 2 * (yy + zz)) + by * 2 * (xy - wz) + bz * 2 * (xz + wy),
    y: bx * 2 * (xy + wz) + by * (1 - 2 * (xx + zz)) + bz * 2 * (yz - wx),
    z: bx * 2 * (xz - wy) + by * 2 * (yz + wx) + bz * (1 - 2 * (xx + yy)),
  };
}

// Inverse of quaternionFromHeading via the body forward direction. Robust
// to non-zero pitch/roll (R7 unlocks both): forward_world = R(q)·(0,0,1) =
// (2(qx·qz + qy·qw), 2(qy·qz − qx·qw), 1 − 2(qx² + qy²)). heading is the
// signed angle in the X-Z plane, which equals atan2(forward.x, forward.z).
function headingFromQuaternion(q: { x: number; y: number; z: number; w: number }): number {
  const fx = 2 * (q.x * q.z + q.y * q.w);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(fx, fz);
}

function makeHardpoints(p: FourWheelVehicleParams): WheelHardpoints {
  const halfTrack = p.trackWidth / 2;
  const wheelY = -p.chassisHeight / 2;
  return {
    fl: { x: -halfTrack, y: wheelY, z: +p.a },
    fr: { x: +halfTrack, y: wheelY, z: +p.a },
    rl: { x: -halfTrack, y: wheelY, z: -p.b },
    rr: { x: +halfTrack, y: wheelY, z: -p.b },
  };
}

const ZERO_WHEEL: WheelState = NEUTRAL_FOUR_WHEEL_STATE.wheels.fl;

export class FourWheelVehicle implements VehicleModel {
  readonly p: FourWheelVehicleParams;
  private readonly world: RAPIER.World;
  private readonly terrain: Heightmap;
  private readonly hardpoints: WheelHardpoints;
  private body: RAPIER.RigidBody;
  private wheelStates: { fl: WheelState; fr: WheelState; rl: WheelState; rr: WheelState };
  // R7: previous-step compression per wheel for the damper's backward-difference
  // dx/dt. `null` until the first step records actual compressions; the first
  // step's damper term is forced to zero (no phantom compression change) which
  // avoids destabilizing the body before equilibrium is reached.
  private prevCompression: { fl: number; fr: number; rl: number; rr: number } | null;

  constructor(deps: FourWheelDeps, initial?: Partial<VehicleState>) {
    this.p = { ...DEFAULT_FOUR_WHEEL_PARAMS, ...deps.params };
    this.world = deps.world;
    this.terrain = deps.terrain;
    this.hardpoints = makeHardpoints(this.p);

    const initX = initial?.x ?? 0;
    const initZ = initial?.z ?? 0;
    const initHeading = initial?.heading ?? 0;
    // R7: initial Y at suspension equilibrium. Wheel hardpoints sit
    // `R_wheel + L_0 − x_rest` above ground; chassis CoG is `chassisHeight/2`
    // above the hardpoints.
    const xRest = (this.p.m * 9.81) / (4 * this.p.springStiffness);
    const initY =
      this.terrain.heightAt(initX, initZ) +
      this.p.wheelRadius +
      this.p.springRestLength -
      xRest +
      this.p.chassisHeight / 2;

    // INTERPRETATION (deviation from spec wording): the design said to attach
    // a cuboid collider matching the visible vehicle box. Implementation uses
    // explicit `setAdditionalMassProperties` with no Rapier collider on the
    // chassis, because a chassis cuboid colliding with the trimesh terrain
    // would generate contact responses that fight our force-based Y
    // management. Mass and yaw inertia match what a 1.8×1.0×4.0 cuboid would
    // compute (mass=1500 kg, Iy=2500 matching R2's bicycle for yaw response).
    // R7: the principal-inertia X and Z components matter now because pitch
    // and roll are unlocked.
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(initX, initY, initZ)
      .setRotation(quaternionFromHeading(initHeading))
      .setAdditionalMassProperties(
        this.p.m,
        { x: 0, y: 0, z: 0 },
        { x: (this.p.m / 12) * (1 + 16), y: this.p.iz, z: (this.p.m / 12) * (1.8 ** 2 + 1) },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    this.body = this.world.createRigidBody(bodyDesc);
    // R7: unlock all 6 DOF. Y is now integrated from gravity vs. spring forces;
    // pitch and roll emerge from forces applied at wheel contact points.
    this.body.setEnabledTranslations(true, true, true, true);
    this.body.setEnabledRotations(true, true, true, true);
    // R7: re-enable gravity. Spring forces balance it at equilibrium.
    this.body.setGravityScale(1, true);
    this.wheelStates = {
      fl: ZERO_WHEEL,
      fr: ZERO_WHEEL,
      rl: ZERO_WHEEL,
      rr: ZERO_WHEEL,
    };
    // First step initializes prevCompression from the actual raycast result,
    // so the damper term reads zero on step 0. Without this, terrain-induced
    // compression asymmetry across wheels at startup would produce huge
    // phantom dx/dt values (60+ kN per wheel) and destabilize the body.
    this.prevCompression = null;
    void xRest; // referenced indirectly via initY; kept for documentation
  }

  get state(): FourWheelVehicleState {
    const t = this.body.translation();
    const q = this.body.rotation();
    const lin = this.body.linvel();
    const ang = this.body.angvel();
    const heading = headingFromQuaternion(q);
    // Body-frame velocities (from R1 convention).
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const vx = lin.x * s + lin.z * c; // forward (+Z body)
    const vy = lin.x * c - lin.z * s; // right (+X body)
    // R7: yawRate = +ang.y (was -ang.y in R4–R6 to compensate for the
    // mirrored quaternion convention; with the corrected convention the
    // sign is direct).
    const yawRate = ang.y;
    // R5: state.slipF / state.slipR are per-axle averages of per-wheel slips
    // stored from the most recent step. They include the steering angle δ for
    // the front axle, matching R2's BicycleVehicle semantics. Before the
    // first step, they default to the neutral state (0).
    const w = this.wheelStates;
    const slipF = (w.fl.slip + w.fr.slip) / 2;
    const slipR = (w.rl.slip + w.rr.slip) / 2;
    const speed = Math.sqrt(vx * vx + vy * vy);
    return {
      x: t.x,
      z: t.z,
      heading,
      speed,
      vx,
      vy,
      yawRate,
      slipF,
      slipR,
      wheels: this.wheelStates,
    };
  }

  reset(partial?: Partial<VehicleState>): void {
    const x = partial?.x ?? 0;
    const z = partial?.z ?? 0;
    const heading = partial?.heading ?? 0;
    // R7: reset places the body at the suspension equilibrium pose, matching
    // the constructor's initial-Y formula.
    const xRest = (this.p.m * 9.81) / (4 * this.p.springStiffness);
    const y =
      this.terrain.heightAt(x, z) +
      this.p.wheelRadius +
      this.p.springRestLength -
      xRest +
      this.p.chassisHeight / 2;
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(quaternionFromHeading(heading), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.wheelStates = {
      fl: ZERO_WHEEL,
      fr: ZERO_WHEEL,
      rl: ZERO_WHEEL,
      rr: ZERO_WHEEL,
    };
    this.prevCompression = null;
  }

  step(dt: number, control: ControlState): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error(`FourWheelVehicle.step: dt must be > 0, got ${dt}`);
    }

    // INTERPRETATION: Rapier's `addForce*` and `addTorque*` accumulate
    // PERSISTENTLY across world.step() calls — they are not auto-cleared.
    // Without these resets the previous step's forces stack on top of this
    // step's, producing runaway accelerations. Calling resetForces /
    // resetTorques at the start of every step gives us per-step force
    // budget semantics, which is what the spec equations assume.
    this.body.resetForces(false);
    this.body.resetTorques(false);

    // R7: pose is now Rapier-integrated (Y unlocked, gravity on, springs
    // applied as forces). We read current pose; we no longer override Y.
    const t = this.body.translation();
    const q = this.body.rotation();
    const heading = headingFromQuaternion(q);

    // Body-frame velocities (yaw-only approximation; pitch/roll stay small
    // for normal driving and the slip-angle math is robust to that).
    const lin = this.body.linvel();
    const ang = this.body.angvel();
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const vx = lin.x * s + lin.z * c;
    const vy = lin.x * c - lin.z * s;
    const yawRate = ang.y; // R7: corrected sign (was -ang.y in R4–R6)

    // Per-wheel raycast against the terrain trimesh, using full body
    // quaternion so pitched/rolled hardpoints land correctly.
    const wheels = this.raycastWheels(t.x, t.y, t.z, q);

    // 4. Quasi-static load transfer using THIS step's expected accelerations
    //    derived from the forces we're about to apply (so the F_z is in-step,
    //    not lagged).
    const throttle = clamp(control.throttle, 0, 1);
    const brake = clamp(control.brake, 0, 1);
    const steer = clamp(control.steer, -1, 1);
    const delta = steer * this.p.deltaMax;

    // R5: per-wheel slip angles. The body-frame velocity at each wheel is
    // `(vy + r·rz, _, vx − r·rx)`, derived from rigid-body kinematics in the
    // body frame. Front wheels' `δ_wheel = δ`; rear wheels' is 0. The
    // longitudinal denominator is clamped to `vMinSlip` so slips stay
    // finite at standstill.
    const halfTrack = this.p.trackWidth / 2;
    const wheelSlip = (rx: number, rz: number, isFront: boolean): number => {
      const vLat = vy + yawRate * rz;
      const vLong = Math.max(vx - yawRate * rx, this.p.vMinSlip);
      const dWheel = isFront ? delta : 0;
      return Math.atan2(vLat, vLong) - dWheel;
    };
    const slipFL = wheelSlip(-halfTrack, +this.p.a, true);
    const slipFR = wheelSlip(+halfTrack, +this.p.a, true);
    const slipRL = wheelSlip(-halfTrack, -this.p.b, false);
    const slipRR = wheelSlip(+halfTrack, -this.p.b, false);
    const cosD = Math.cos(delta);
    // Per-axle averages live on `state.slipF/slipR` (computed in the getter
    // from wheelStates); not needed locally.

    // Longitudinal force scalars (used below for drive/brake/drag application).
    const sgnVx = Math.sign(vx);
    const fxDrive = throttle * this.p.fDrive;
    const fxDrag = this.p.dragCoef * vx;

    // R7: per-wheel spring + damper force replaces R4–R6's quasi-static F_z.
    // The wheel hangs `L_0 − x` below its hardpoint and contacts ground a
    // further R_wheel below — so spring length = (hardpoint→ground) − R_wheel,
    // and compression = L_0 − spring_length = (L_0 + R_wheel) − hardpoint_dist.
    // The `max(0, …)` clamps to non-tensile (wheels in air don't pull down).
    // Force = k·x + c·dx/dt; applied at the wheel's contact point in world +Y.
    const k = this.p.springStiffness;
    const cDamp = this.p.springDamping;
    const L0 = this.p.springRestLength;
    const Rw = this.p.wheelRadius;

    const computeSpring = (
      wheel: WheelState,
      prev: number | null,
    ): { fz: number; compression: number } => {
      if (!wheel.contact) {
        return { fz: 0, compression: 0 };
      }
      const compression = Math.max(0, L0 + Rw - wheel.contactDistance);
      // First step (prev === null): damper term zero; use spring only to
      // avoid a spurious 60 kN/wheel "phantom dx/dt" kick from the
      // previously-uninitialized state.
      const dxDt = prev === null ? 0 : (compression - prev) / dt;
      const fz = Math.max(0, k * compression + cDamp * dxDt);
      return { fz, compression };
    };

    const prev = this.prevCompression;
    const sFL = computeSpring(wheels.fl, prev?.fl ?? null);
    const sFR = computeSpring(wheels.fr, prev?.fr ?? null);
    const sRL = computeSpring(wheels.rl, prev?.rl ?? null);
    const sRR = computeSpring(wheels.rr, prev?.rr ?? null);
    const fzFL = sFL.fz;
    const fzFR = sFR.fz;
    const fzRL = sRL.fz;
    const fzRR = sRR.fz;

    this.wheelStates = {
      fl: { ...wheels.fl, fz: fzFL, slip: slipFL, compression: sFL.compression },
      fr: { ...wheels.fr, fz: fzFR, slip: slipFR, compression: sFR.compression },
      rl: { ...wheels.rl, fz: fzRL, slip: slipRL, compression: sRL.compression },
      rr: { ...wheels.rr, fz: fzRR, slip: slipRR, compression: sRR.compression },
    };

    // Apply spring forces along world +Y at each wheel's contact point.
    const applySpring = (wheel: WheelState, fz: number) => {
      if (fz === 0) return;
      this.body.addForceAtPoint({ x: 0, y: fz, z: 0 }, wheel.position, true);
    };
    applySpring(wheels.fl, fzFL);
    applySpring(wheels.fr, fzFR);
    applySpring(wheels.rl, fzRL);
    applySpring(wheels.rr, fzRR);

    // 5. Force application.

    // Drive force at rear wheels (split equally), only when those wheels are
    // in contact. Spec scenario "no drive force when not in contact".
    const drivePerRearWheel = fxDrive / 2;
    const driveBodyZ =
      (wheels.rl.contact ? drivePerRearWheel : 0) + (wheels.rr.contact ? drivePerRearWheel : 0);
    if (driveBodyZ !== 0) {
      // Apply at each rear wheel's hardpoint world position.
      if (wheels.rl.contact) {
        const wp = wheels.rl.position;
        const fw = rotateBodyToWorld(0, 0, drivePerRearWheel, heading);
        this.body.addForceAtPoint(fw, wp, true);
      }
      if (wheels.rr.contact) {
        const wp = wheels.rr.position;
        const fw = rotateBodyToWorld(0, 0, drivePerRearWheel, heading);
        this.body.addForceAtPoint(fw, wp, true);
      }
    }

    // Brake force at all four wheels (split equally), opposing motion.
    if (brake > 0 && Math.abs(vx) > 1e-6) {
      const brakePerWheel = (brake * this.p.fBrake * sgnVx) / 4;
      for (const w of [wheels.fl, wheels.fr, wheels.rl, wheels.rr]) {
        if (!w.contact) continue;
        const fw = rotateBodyToWorld(0, 0, -brakePerWheel, heading);
        this.body.addForceAtPoint(fw, w.position, true);
      }
    }

    // Linear drag at CoG, opposing forward velocity.
    if (Math.abs(vx) > 1e-9) {
      const dragWorld = rotateBodyToWorld(0, 0, -fxDrag, heading);
      this.body.addForce(dragWorld, true);
    }

    // R5: per-wheel lateral force via the tire model, applied at each wheel's
    // world contact point. For front wheels the tire's lateral direction is
    // body +X rotated by δ around +Y, giving a body-frame force vector
    // `(F_y · cos δ, 0, −F_y · sin δ)`. Rear wheels' δ is 0, so the force is
    // simply along body +X.
    //
    // The tireModel is invoked four times per step (once per wheel) — spec
    // scenario "TireModel SHALL be invoked exactly four times per step". For
    // wheels with no contact, fz=0 and the linear law returns 0; we still
    // call the model to honor the spec's call count.
    const fyFL = this.p.tireModel.lateralForce(slipFL, fzFL, 'front');
    const fyFR = this.p.tireModel.lateralForce(slipFR, fzFR, 'front');
    const fyRL = this.p.tireModel.lateralForce(slipRL, fzRL, 'rear');
    const fyRR = this.p.tireModel.lateralForce(slipRR, fzRR, 'rear');
    const sinD = Math.sin(delta);
    const applyFrontLateral = (fy: number, wp: { x: number; y: number; z: number }) => {
      if (fy === 0) return;
      const fw = rotateBodyToWorld(fy * cosD, 0, -fy * sinD, heading);
      this.body.addForceAtPoint(fw, wp, true);
    };
    const applyRearLateral = (fy: number, wp: { x: number; y: number; z: number }) => {
      if (fy === 0) return;
      const fw = rotateBodyToWorld(fy, 0, 0, heading);
      this.body.addForceAtPoint(fw, wp, true);
    };
    if (wheels.fl.contact) applyFrontLateral(fyFL, wheels.fl.position);
    if (wheels.fr.contact) applyFrontLateral(fyFR, wheels.fr.position);
    if (wheels.rl.contact) applyRearLateral(fyRL, wheels.rl.position);
    if (wheels.rr.contact) applyRearLateral(fyRR, wheels.rr.position);

    // Forward-only constraint: zero out negative body-frame vx. R7: preserve
    // lin.y so we don't clobber Rapier's gravity / spring integration on Y.
    if (vx < 0) {
      const newLinX = vy * c;
      const newLinZ = -vy * s;
      this.body.setLinvel({ x: newLinX, y: lin.y, z: newLinZ }, true);
    }

    // Cap forward velocity at vMax similarly (preserve lin.y).
    if (vx > this.p.vMax) {
      const newVx = this.p.vMax;
      const newLinX = newVx * s + vy * c;
      const newLinZ = newVx * c - vy * s;
      this.body.setLinvel({ x: newLinX, y: lin.y, z: newLinZ }, true);
    }

    // R7: stash this step's compression for the next step's damper dx/dt.
    this.prevCompression = {
      fl: sFL.compression,
      fr: sFR.compression,
      rl: sRL.compression,
      rr: sRR.compression,
    };
  }

  // Per-wheel raycast against the terrain trimesh. Hardpoint is in world
  // frame; ray starts `wheelRayHover` above hardpoint and goes -Y by
  // `wheelRayHover + wheelMaxRayLen`. Hit timeOfImpact gives distance from
  // ray origin; subtracting `wheelRayHover` gives distance from hardpoint
  // to ground (negative if hardpoint is below ground; clamped to 0).
  private raycastWheels(
    bodyX: number,
    bodyY: number,
    bodyZ: number,
    bodyQuat: { x: number; y: number; z: number; w: number },
  ): { fl: WheelState; fr: WheelState; rl: WheelState; rr: WheelState } {
    const result: Record<WheelId, WheelState> = {
      fl: ZERO_WHEEL,
      fr: ZERO_WHEEL,
      rl: ZERO_WHEEL,
      rr: ZERO_WHEEL,
    };
    const ids: WheelId[] = ['fl', 'fr', 'rl', 'rr'];
    for (const id of ids) {
      const hp = this.hardpoints[id];
      // R7: use full body quaternion (not yaw-only) so pitched/rolled body
      // positions hardpoints correctly. Spring forces applied at these
      // positions produce the right torque to stabilize the chassis.
      const wp = rotateByQuaternion(hp.x, hp.y, hp.z, bodyQuat);
      const wpWorld = { x: bodyX + wp.x, y: bodyY + wp.y, z: bodyZ + wp.z };
      const origin = {
        x: wpWorld.x,
        y: wpWorld.y + this.p.wheelRayHover,
        z: wpWorld.z,
      };
      const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
      const maxToi = this.p.wheelRayHover + this.p.wheelMaxRayLen;
      const hit = this.world.castRayAndGetNormal(ray, maxToi, true);
      if (hit) {
        const distFromHardpoint = Math.max(0, hit.timeOfImpact - this.p.wheelRayHover);
        result[id] = {
          position: wpWorld,
          contact: true,
          contactDistance: distFromHardpoint,
          fz: 0, // populated by step() after spring computation
          slip: 0, // populated by step() after slip-angle calculation
          compression: 0, // populated by step() after spring computation
        };
      } else {
        result[id] = {
          position: wpWorld,
          contact: false,
          contactDistance: 0,
          fz: 0,
          slip: 0,
          compression: 0,
        };
      }
    }
    return result;
  }

  // Frees the underlying Rapier rigid body. Used by tests that create many
  // worlds; the app's lifecycle uses `physics.free()` which removes the
  // whole world.
  free(): void {
    this.world.removeRigidBody(this.body);
  }
}
