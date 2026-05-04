// World-space pose and forward-speed scalar of a vehicle.
//
// Convention (fixed by the R1 spec): heading = 0 points along +Z, and yaw is
// counter-clockwise positive when viewed from +Y. In the right-handed Three.js
// coordinate system this corresponds to a -Y axis rotation by `heading`.
export interface VehicleState {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
}

export interface VehicleModel {
  readonly state: VehicleState;
  // Synchronous; mutates internal state. Called exactly once per sim step,
  // after the input source has been sampled and before telemetry is recorded.
  step(dt: number, control: import('../input/types.js').ControlState): void;
  // Repositions the vehicle. Fields not provided in `partial` keep their
  // current value. Used by tests / replay to set deterministic initial state.
  reset(partial?: Partial<VehicleState>): void;
}

export const NEUTRAL_VEHICLE_STATE: VehicleState = Object.freeze({
  x: 0,
  z: 0,
  heading: 0,
  speed: 0,
});

// Extended state produced by the R2 bicycle model and any later rung that
// continues to expose body-frame velocities and slip angles. Structurally a
// superset of `VehicleState`.
export interface BicycleVehicleState extends VehicleState {
  readonly vx: number;
  readonly vy: number;
  readonly yawRate: number;
  readonly slipF: number;
  readonly slipR: number;
}

export const NEUTRAL_BICYCLE_STATE: BicycleVehicleState = Object.freeze({
  x: 0,
  z: 0,
  heading: 0,
  speed: 0,
  vx: 0,
  vy: 0,
  yawRate: 0,
  slipF: 0,
  slipR: 0,
});

// Per-wheel state populated by R4's FourWheelVehicle, extended in R5 with
// the per-wheel slip angle. `position` is the wheel hardpoint in world frame;
// `contact` reflects the most recent raycast result. `fz` is the quasi-static
// normal force in newtons (0 when not in contact). `slip` is the per-wheel
// slip angle in radians as of the most recent step (front wheels include the
// steering angle δ; rear wheels do not).
export interface WheelState {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly contact: boolean;
  readonly contactDistance: number;
  readonly fz: number;
  readonly slip: number;
}

export interface FourWheelVehicleState extends BicycleVehicleState {
  readonly wheels: {
    readonly fl: WheelState;
    readonly fr: WheelState;
    readonly rl: WheelState;
    readonly rr: WheelState;
  };
}

const NEUTRAL_WHEEL_STATE: WheelState = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  contact: false,
  contactDistance: 0,
  fz: 0,
  slip: 0,
});

export const NEUTRAL_FOUR_WHEEL_STATE: FourWheelVehicleState = Object.freeze({
  ...NEUTRAL_BICYCLE_STATE,
  wheels: Object.freeze({
    fl: NEUTRAL_WHEEL_STATE,
    fr: NEUTRAL_WHEEL_STATE,
    rl: NEUTRAL_WHEEL_STATE,
    rr: NEUTRAL_WHEEL_STATE,
  }),
});
