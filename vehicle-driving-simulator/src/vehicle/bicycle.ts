import type { ControlState } from '../input/types.js';
import {
  type BicycleVehicleState,
  NEUTRAL_BICYCLE_STATE,
  type VehicleModel,
  type VehicleState,
} from './types.js';

export type AxleId = 'front' | 'rear';

export type TireForceFn = (slipAngle: number, axle: AxleId, params: BicycleVehicleParams) => number;

export interface BicycleVehicleParams {
  readonly m: number; // mass (kg)
  readonly iz: number; // yaw inertia (kg·m²)
  readonly a: number; // CoG → front axle (m)
  readonly b: number; // CoG → rear axle (m)
  readonly cAlpha: number; // cornering stiffness per axle (N/rad)
  readonly fDrive: number; // max longitudinal drive force (N)
  readonly fBrake: number; // max brake force (N)
  readonly dragCoef: number; // linear drag coefficient (N·s/m); F_drag = dragCoef * vx
  readonly deltaMax: number; // max steering angle (rad)
  readonly vMax: number; // longitudinal speed cap (m/s)
  readonly vMinSlip: number; // floor for slip-angle denominator (m/s)
  readonly tireFn: TireForceFn;
}

// Default linear tire law: F_y = -Cα * α. Negative because lateral force opposes
// slip. Future rungs (R5 linear-tire, R6 Pacejka) replace this fn.
export const DEFAULT_TIRE_FN: TireForceFn = (slip, _axle, params) => {
  return -params.cAlpha * slip;
};

export const DEFAULT_BICYCLE_PARAMS: BicycleVehicleParams = Object.freeze({
  m: 1500,
  iz: 2500,
  a: 1.2,
  b: 1.4,
  cAlpha: 80000,
  fDrive: 9000, // ≈ 6 m/s² at 1500 kg, matching R1's aMax
  fBrake: 18000, // ≈ 12 m/s² at 1500 kg, matching R1's brakeDecel
  // INTERPRETATION (deviation from R1): R1 used a constant drag deceleration
  // (0.5 m/s² regardless of speed). With constant drag and constant fDrive,
  // partial throttle has no longitudinal equilibrium below vMax — vx just
  // grows until the clamp. That breaks the steady-state-cornering scenario,
  // which requires vx (and therefore yawRate) to converge in 5 sim seconds
  // at throttle=0.5. Switching to a linear drag F_drag = dragCoef * vx
  // gives a real equilibrium at vx_ss = throttle * vMax, and matches
  // first-order aerodynamic / rolling drag in real cars. The default value
  // is chosen so throttle = 1 saturates exactly at vMax (force balance):
  //   dragCoef = fDrive / vMax = 9000 / 25 = 360 N·s/m.
  dragCoef: 360,
  deltaMax: 0.524, // ~30°
  vMax: 25, // matches R1
  vMinSlip: 0.5,
  tireFn: DEFAULT_TIRE_FN,
});

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class BicycleVehicle implements VehicleModel {
  private _state: BicycleVehicleState;
  private readonly p: BicycleVehicleParams;

  constructor(params: Partial<BicycleVehicleParams> = {}, initial?: Partial<BicycleVehicleState>) {
    this.p = { ...DEFAULT_BICYCLE_PARAMS, ...params };
    this._state = { ...NEUTRAL_BICYCLE_STATE, ...initial };
  }

  get state(): BicycleVehicleState {
    return this._state;
  }

  reset(partial?: Partial<VehicleState> | Partial<BicycleVehicleState>): void {
    this._state = { ...NEUTRAL_BICYCLE_STATE, ...partial };
  }

  step(dt: number, control: ControlState): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error(`BicycleVehicle.step: dt must be > 0, got ${dt}`);
    }
    const p = this.p;
    const { vx, vy, yawRate: r, heading, x, z } = this._state;

    const throttle = clamp(control.throttle, 0, 1);
    const brake = clamp(control.brake, 0, 1);
    const steer = clamp(control.steer, -1, 1);

    const delta = steer * p.deltaMax;
    // Clamp the slip-angle denominator. atan2 itself is well-defined at vx=0,
    // but the linear tire force at α≈π/2 with vx near 0 is unphysically huge,
    // and would destabilize the integrator. Clamping to vMinSlip caps the
    // effective slip magnitude at standstill.
    const vxSafe = Math.max(vx, p.vMinSlip);

    const slipF = Math.atan2(vy + p.a * r, vxSafe) - delta;
    const slipR = Math.atan2(vy - p.b * r, vxSafe);

    const fyf = p.tireFn(slipF, 'front', p);
    const fyr = p.tireFn(slipR, 'rear', p);

    // Longitudinal force. Brake opposes current motion direction; sign(0)=0
    // means a stationary vehicle isn't pushed backward by braking. Drag is
    // linear in vx, so it naturally vanishes at standstill.
    const sgnVx = Math.sign(vx);
    const fxDrive = throttle * p.fDrive;
    const fxBrake = brake * p.fBrake * sgnVx;
    const fxDrag = p.dragCoef * vx;
    const fx = fxDrive - fxBrake - fxDrag;

    const cosD = Math.cos(delta);
    // Body-frame equations of motion. The cross-product terms (vy*r, vx*r)
    // come from differentiating body-frame velocity in a rotating frame.
    const vxDot = fx / p.m + vy * r;
    const vyDot = (fyf * cosD + fyr) / p.m - vx * r;
    const rDot = (p.a * fyf * cosD - p.b * fyr) / p.iz;

    // Semi-implicit Euler: update velocities, then use new velocities for pose.
    let newVx = vx + vxDot * dt;
    const newVy = vy + vyDot * dt;
    const newR = r + rDot * dt;

    // No reverse gear (R2 keeps R1's forward-only constraint).
    if (newVx < 0) newVx = 0;
    if (newVx > p.vMax) newVx = p.vMax;

    const newHeading = heading + newR * dt;
    const newX = x + (newVx * Math.sin(newHeading) + newVy * Math.cos(newHeading)) * dt;
    const newZ = z + (newVx * Math.cos(newHeading) - newVy * Math.sin(newHeading)) * dt;
    const newSpeed = Math.sqrt(newVx * newVx + newVy * newVy);

    this._state = {
      x: newX,
      z: newZ,
      heading: newHeading,
      speed: newSpeed,
      vx: newVx,
      vy: newVy,
      yawRate: newR,
      slipF,
      slipR,
    };
  }
}
