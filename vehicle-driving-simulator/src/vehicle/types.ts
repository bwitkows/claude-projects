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
