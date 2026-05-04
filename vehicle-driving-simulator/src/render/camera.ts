// Pure helper for the chase camera. No Three.js types — the scene module
// reads the helper's outputs and applies them to a THREE.PerspectiveCamera.
// Keeping it pure makes it unit-testable in node without a DOM.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ChaseCameraParams {
  // Body-frame offset from the vehicle origin to the camera. At heading=0
  // this is also the world-frame offset. Default: (0, 4, -8) → 4 m up, 8 m
  // behind a vehicle facing +Z.
  readonly offset: Vec3;
  // Body-frame offset from the vehicle origin to the look-at point. Default
  // (0, 1, 4) → 1 m up, 4 m ahead, so the camera leads the vehicle.
  readonly lookAtOffset: Vec3;
  // Exponential decay rate (per second) for both position and look-at.
  readonly decay: number;
}

export const DEFAULT_CHASE_PARAMS: ChaseCameraParams = Object.freeze({
  offset: Object.freeze({ x: 0, y: 4, z: -8 }),
  lookAtOffset: Object.freeze({ x: 0, y: 1, z: 4 }),
  decay: 6,
});

export interface ChaseStepInput {
  readonly vehiclePos: Vec3;
  readonly vehicleHeading: number;
  readonly dt: number;
}

export interface ChaseFrame {
  readonly position: Vec3;
  readonly lookAt: Vec3;
}

// Rotates a body-frame offset (bx, by, bz) by `heading` (CCW around +Y) into
// world frame. Heading sign matches the R1 vehicle convention: heading=0 →
// forward = +Z, heading=π/2 → forward = +X.
function rotateBodyToWorld(b: Vec3, heading: number): Vec3 {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return {
    x: b.x * c + b.z * s,
    y: b.y,
    z: -b.x * s + b.z * c,
  };
}

export class ChaseCameraState {
  readonly params: ChaseCameraParams;
  position: Vec3;
  lookAt: Vec3;

  constructor(params: Partial<ChaseCameraParams> = {}, initial?: Partial<ChaseFrame>) {
    this.params = {
      ...DEFAULT_CHASE_PARAMS,
      ...params,
    };
    this.position = { ...(initial?.position ?? { x: 0, y: 0, z: 0 }) };
    this.lookAt = { ...(initial?.lookAt ?? { x: 0, y: 0, z: 0 }) };
  }

  // Snap immediately to the steady-state position for the given vehicle pose,
  // skipping the lerp. Useful to position the camera correctly on the very
  // first frame, before any wall-clock dt has been measured.
  snap(vehiclePos: Vec3, vehicleHeading: number): void {
    const offset = rotateBodyToWorld(this.params.offset, vehicleHeading);
    const look = rotateBodyToWorld(this.params.lookAtOffset, vehicleHeading);
    this.position = {
      x: vehiclePos.x + offset.x,
      y: vehiclePos.y + offset.y,
      z: vehiclePos.z + offset.z,
    };
    this.lookAt = {
      x: vehiclePos.x + look.x,
      y: vehiclePos.y + look.y,
      z: vehiclePos.z + look.z,
    };
  }

  step(input: ChaseStepInput): ChaseFrame {
    if (!Number.isFinite(input.dt) || input.dt < 0) {
      throw new Error(`ChaseCameraState.step: dt must be finite and >= 0, got ${input.dt}`);
    }
    const offset = rotateBodyToWorld(this.params.offset, input.vehicleHeading);
    const look = rotateBodyToWorld(this.params.lookAtOffset, input.vehicleHeading);
    const desiredPos: Vec3 = {
      x: input.vehiclePos.x + offset.x,
      y: input.vehiclePos.y + offset.y,
      z: input.vehiclePos.z + offset.z,
    };
    const desiredLook: Vec3 = {
      x: input.vehiclePos.x + look.x,
      y: input.vehiclePos.y + look.y,
      z: input.vehiclePos.z + look.z,
    };

    // 1 - exp(-k*dt) is time-correct: at any frame rate, the camera approaches
    // its target with the same time constant 1/k.
    const alpha = 1 - Math.exp(-this.params.decay * input.dt);

    this.position = {
      x: this.position.x + (desiredPos.x - this.position.x) * alpha,
      y: this.position.y + (desiredPos.y - this.position.y) * alpha,
      z: this.position.z + (desiredPos.z - this.position.z) * alpha,
    };
    this.lookAt = {
      x: this.lookAt.x + (desiredLook.x - this.lookAt.x) * alpha,
      y: this.lookAt.y + (desiredLook.y - this.lookAt.y) * alpha,
      z: this.lookAt.z + (desiredLook.z - this.lookAt.z) * alpha,
    };

    return { position: { ...this.position }, lookAt: { ...this.lookAt } };
  }
}
