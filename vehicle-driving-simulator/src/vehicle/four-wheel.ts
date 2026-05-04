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
  readonly rideHeight: number; // body Y offset above terrain (m)
  readonly wheelMaxRayLen: number; // raycast distance allowance below hardpoint (m)
  readonly wheelRayHover: number; // ray origin offset above hardpoint (m)
  // R5/R6: tire force model. Default is PacejkaTireModel(DEFAULT_PACEJKA_PARAMS)
  // — the saturating Magic Formula. R5's LinearTireModel remains exported and
  // can be passed explicitly for the unbounded linear regime.
  readonly tireModel: TireModel;
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

// Yaw-only quaternion. heading=0 → identity. CCW around +Y is positive in
// the textbook sense, but R1's convention defines heading so that "increasing
// heading" rotates body +Z toward body +X (right turn from +Y view). The
// physical rotation around +Y that achieves +Z → +X is a NEGATIVE rotation
// in standard math convention. Hence the sign.
function quaternionFromHeading(heading: number): { x: number; y: number; z: number; w: number } {
  const half = -heading * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

// Inverse of quaternionFromHeading. With pitch/roll locked, the only
// non-zero quaternion components are y and w.
function headingFromQuaternion(q: { x: number; y: number; z: number; w: number }): number {
  // q.y = sin(-h/2), q.w = cos(-h/2). atan2(q.y, q.w) = -h/2.
  return -2 * Math.atan2(q.y, q.w);
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

  constructor(deps: FourWheelDeps, initial?: Partial<VehicleState>) {
    this.p = { ...DEFAULT_FOUR_WHEEL_PARAMS, ...deps.params };
    this.world = deps.world;
    this.terrain = deps.terrain;
    this.hardpoints = makeHardpoints(this.p);

    const initX = initial?.x ?? 0;
    const initZ = initial?.z ?? 0;
    const initHeading = initial?.heading ?? 0;
    const initY = this.terrain.heightAt(initX, initZ) + this.p.rideHeight;

    // INTERPRETATION (deviation from spec wording): the design said to attach
    // a cuboid collider matching the visible vehicle box. Implementation uses
    // explicit `setAdditionalMassProperties` with no Rapier collider on the
    // chassis, because a chassis cuboid colliding with the trimesh terrain
    // would generate contact responses that fight our manual Y management.
    // Mass and yaw inertia match what a 1.8×1.0×4.0 cuboid would compute
    // (mass=1500 kg, Iy chosen as 2500 to match R2's bicycle exactly so the
    // yaw response is comparable). R7 (suspension) may revisit this choice.
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(initX, initY, initZ)
      .setRotation(quaternionFromHeading(initHeading))
      .setAdditionalMassProperties(
        this.p.m,
        { x: 0, y: 0, z: 0 },
        // Principal angular inertia. Pitch/roll are locked so their values
        // don't matter; we set them to a cuboid-derived value for niceness.
        { x: (this.p.m / 12) * (1 + 16), y: this.p.iz, z: (this.p.m / 12) * (1.8 ** 2 + 1) },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    this.body = this.world.createRigidBody(bodyDesc);
    // Lock vertical translation and pitch/roll. Only X, Z, and yaw integrate.
    this.body.setEnabledTranslations(true, false, true, true);
    this.body.setEnabledRotations(false, true, false, true);
    // Disable gravity — we manage Y manually from terrain.heightAt; gravity
    // would otherwise just be canceled by ΣFz, but we don't apply Fz as a
    // physical upward force in R4 (Y is locked).
    this.body.setGravityScale(0, true);
    // Initial wheel states: all neutral until first step does raycasts.
    this.wheelStates = {
      fl: ZERO_WHEEL,
      fr: ZERO_WHEEL,
      rl: ZERO_WHEEL,
      rr: ZERO_WHEEL,
    };
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
    const yawRate = -ang.y; // see quaternionFromHeading sign convention
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
    const y = this.terrain.heightAt(x, z) + this.p.rideHeight;
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

    // 1. Pose: read current X, Z; force Y to follow terrain.
    const t = this.body.translation();
    const q = this.body.rotation();
    const heading = headingFromQuaternion(q);
    const newY = this.terrain.heightAt(t.x, t.z) + this.p.rideHeight;
    this.body.setTranslation({ x: t.x, y: newY, z: t.z }, true);

    // 2. Body-frame velocities at this step (used everywhere downstream).
    const lin = this.body.linvel();
    const ang = this.body.angvel();
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const vx = lin.x * s + lin.z * c;
    const vy = lin.x * c - lin.z * s;
    const yawRate = -ang.y;

    // 3. Per-wheel raycast against the terrain trimesh.
    const wheels = this.raycastWheels(t.x, newY, t.z, heading);

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
    // Per-axle averages preserved for telemetry / R2 backward comparability.
    const slipF = (slipFL + slipFR) / 2;
    const slipR = (slipRL + slipRR) / 2;

    // Longitudinal force on the body (used for load transfer estimate).
    const sgnVx = Math.sign(vx);
    const fxDrive = throttle * this.p.fDrive;
    const fxBrake = brake * this.p.fBrake * sgnVx;
    const fxDrag = this.p.dragCoef * vx;
    const fxNet = fxDrive - fxBrake - fxDrag;

    // Body-frame accelerations at the CoG.
    const aX = fxNet / this.p.m;
    // Lateral acceleration estimate for load transfer. R5 has a chicken-and-
    // egg problem: F_z depends on a_y, a_y depends on F_y, F_y depends on
    // F_z. We break the loop by estimating F_y here using the static F_z
    // distribution (m·g·b/(2L) front, m·g·a/(2L) rear) and the per-axle
    // average slip. The exact per-wheel forces (computed below using actual
    // F_z) differ from this estimate by an amount proportional to the
    // lateral-load-transfer-induced asymmetry, which is small at the slips
    // R5 operates in.
    const fzAxleStaticFront = (this.p.m * 9.81 * this.p.b) / (this.p.a + this.p.b);
    const fzAxleStaticRear = (this.p.m * 9.81 * this.p.a) / (this.p.a + this.p.b);
    const fyfEstimate = this.p.tireModel.lateralForce(slipF, fzAxleStaticFront, 'front');
    const fyrEstimate = this.p.tireModel.lateralForce(slipR, fzAxleStaticRear, 'rear');
    const aY = (fyfEstimate * cosD + fyrEstimate) / this.p.m - vx * yawRate;

    // Quasi-static load transfer.
    const L = this.p.a + this.p.b;
    const W = this.p.trackWidth;
    const fzStaticFront = fzAxleStaticFront;
    const fzStaticRear = fzAxleStaticRear;
    const dFzLong = (this.p.m * aX * this.p.hCog) / L;
    const dFzLat = (this.p.m * aY * this.p.hCog) / W;

    let fzFL = fzStaticFront / 2 - dFzLong / 2 - dFzLat / 2;
    let fzFR = fzStaticFront / 2 - dFzLong / 2 + dFzLat / 2;
    let fzRL = fzStaticRear / 2 + dFzLong / 2 - dFzLat / 2;
    let fzRR = fzStaticRear / 2 + dFzLong / 2 + dFzLat / 2;

    // Wheels report contact = false when raycast didn't hit; their fz is 0.
    const fzPair = (raw: number, contact: boolean) => (contact ? Math.max(0, raw) : 0);
    fzFL = fzPair(fzFL, wheels.fl.contact);
    fzFR = fzPair(fzFR, wheels.fr.contact);
    fzRL = fzPair(fzRL, wheels.rl.contact);
    fzRR = fzPair(fzRR, wheels.rr.contact);

    this.wheelStates = {
      fl: { ...wheels.fl, fz: fzFL, slip: slipFL },
      fr: { ...wheels.fr, fz: fzFR, slip: slipFR },
      rl: { ...wheels.rl, fz: fzRL, slip: slipRL },
      rr: { ...wheels.rr, fz: fzRR, slip: slipRR },
    };

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

    // Forward-only constraint: zero out negative body-frame vx after physics
    // step. We set linvel here pre-step, before world.step integrates further
    // — so this is the previous step's vx clamp, which is acceptable.
    if (vx < 0) {
      // Re-project body-frame (0, vy) to world and write back.
      const newLinX = vy * c;
      const newLinZ = -vy * s;
      this.body.setLinvel({ x: newLinX, y: 0, z: newLinZ }, true);
    }

    // Cap forward velocity at vMax similarly.
    if (vx > this.p.vMax) {
      const newVx = this.p.vMax;
      const newLinX = newVx * s + vy * c;
      const newLinZ = newVx * c - vy * s;
      this.body.setLinvel({ x: newLinX, y: 0, z: newLinZ }, true);
    }
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
    heading: number,
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
      const wp = rotateBodyToWorld(hp.x, hp.y, hp.z, heading);
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
          fz: 0, // populated by step() after load transfer
          slip: 0, // populated by step() after slip-angle calculation
        };
      } else {
        result[id] = {
          position: wpWorld,
          contact: false,
          contactDistance: 0,
          fz: 0,
          slip: 0,
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
