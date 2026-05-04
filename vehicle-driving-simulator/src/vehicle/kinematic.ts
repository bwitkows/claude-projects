import type { ControlState } from '../input/types.js';
import { NEUTRAL_VEHICLE_STATE, type VehicleModel, type VehicleState } from './types.js';

export interface KinematicVehicleParams {
  readonly vMax: number;
  readonly aMax: number;
  readonly brakeDecel: number;
  readonly drag: number;
  readonly yawRateAtVMax: number;
}

export const DEFAULT_KINEMATIC_PARAMS: KinematicVehicleParams = Object.freeze({
  vMax: 25, // m/s, ~90 km/h
  aMax: 6, // m/s² throttle accel
  brakeDecel: 12, // m/s² braking
  drag: 0.5, // m/s² coast drag
  yawRateAtVMax: 1.5, // rad/s at full lock and full speed
});

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class KinematicVehicle implements VehicleModel {
  private _state: VehicleState;
  private readonly p: KinematicVehicleParams;

  constructor(params: Partial<KinematicVehicleParams> = {}, initial?: Partial<VehicleState>) {
    this.p = { ...DEFAULT_KINEMATIC_PARAMS, ...params };
    this._state = { ...NEUTRAL_VEHICLE_STATE, ...initial };
  }

  get state(): VehicleState {
    return this._state;
  }

  reset(partial?: Partial<VehicleState>): void {
    this._state = { ...NEUTRAL_VEHICLE_STATE, ...partial };
  }

  step(dt: number, control: ControlState): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error(`KinematicVehicle.step: dt must be > 0, got ${dt}`);
    }
    const { vMax, aMax, brakeDecel, drag, yawRateAtVMax } = this.p;
    let { x, z, heading, speed } = this._state;

    // Throttle: bring speed toward `throttle * vMax` at rate aMax.
    const desired = clamp(control.throttle, 0, 1) * vMax;
    const dv = clamp(desired - speed, -aMax * dt, aMax * dt);
    speed += dv;

    // Brake: subtractive, never negative.
    speed = Math.max(0, speed - clamp(control.brake, 0, 1) * brakeDecel * dt);

    // Coast drag (always applied, kept small so it doesn't fight throttle).
    speed = Math.max(0, speed - drag * dt);

    // Cap to vMax even if floating-point error pushed past it.
    speed = clamp(speed, 0, vMax);

    // Yaw rate scales with current speed → no turn-in-place.
    const steer = clamp(control.steer, -1, 1);
    const yawRate = steer * yawRateAtVMax * (speed / vMax);
    heading += yawRate * dt;

    // Forward-only translation along heading. heading=0 → +Z.
    x += speed * Math.sin(heading) * dt;
    z += speed * Math.cos(heading) * dt;

    this._state = { x, z, heading, speed };
  }
}
