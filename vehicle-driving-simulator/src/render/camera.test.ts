import { describe, expect, it } from 'vitest';
import { ChaseCameraState, DEFAULT_CHASE_PARAMS } from './camera.js';

describe('ChaseCameraState — snap', () => {
  it('places camera at the configured world-frame offset for heading=0', () => {
    const cam = new ChaseCameraState();
    cam.snap({ x: 0, y: 0, z: 0 }, 0);
    expect(cam.position.x).toBeCloseTo(0, 12);
    expect(cam.position.y).toBeCloseTo(4, 12);
    expect(cam.position.z).toBeCloseTo(-8, 12);
  });

  it('rotates the offset around +Y when heading changes', () => {
    const cam = new ChaseCameraState();
    // Vehicle facing +X (heading = π/2). Body offset (0,4,-8) rotates so
    // "behind" points -X. Expected world position: (-(-8) → 8 wait let me redo.
    // body (0, 4, -8) rotated by π/2 (CCW around +Y, mapping +Z → +X):
    //  worldX = bx*cos + bz*sin = 0*0 + -8*1 = -8
    //  worldZ = -bx*sin + bz*cos = 0 + -8*0 = 0
    // So camera is at (-8, 4, 0) when vehicle at origin facing +X.
    cam.snap({ x: 0, y: 0, z: 0 }, Math.PI / 2);
    expect(cam.position.x).toBeCloseTo(-8, 12);
    expect(cam.position.y).toBeCloseTo(4, 12);
    expect(cam.position.z).toBeCloseTo(0, 12);
  });
});

describe('ChaseCameraState — step monotonic convergence', () => {
  it('one step from far-from-target advances each component toward target', () => {
    const cam = new ChaseCameraState(
      {},
      {
        position: { x: 100, y: 100, z: 100 },
        lookAt: { x: 100, y: 100, z: 100 },
      },
    );
    const before = { ...cam.position };
    cam.step({ vehiclePos: { x: 0, y: 0, z: 0 }, vehicleHeading: 0, dt: 1 / 60 });
    // Target is (0,4,-8) → from (100,100,100) all three should move toward target.
    expect(Math.abs(cam.position.x)).toBeLessThan(Math.abs(before.x));
    expect(Math.abs(cam.position.y - 4)).toBeLessThan(Math.abs(before.y - 4));
    expect(Math.abs(cam.position.z - -8)).toBeLessThan(Math.abs(before.z - -8));
  });
});

describe('ChaseCameraState — steady state', () => {
  it('converges to the configured body-frame offset within 1e-6 after several seconds', () => {
    const cam = new ChaseCameraState();
    // Start very far away.
    cam.position = { x: 1000, y: 1000, z: 1000 };
    cam.lookAt = { x: 1000, y: 1000, z: 1000 };
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 5; i += 1) {
      cam.step({ vehiclePos: { x: 0, y: 0, z: 0 }, vehicleHeading: 0, dt });
    }
    expect(Math.abs(cam.position.x - 0)).toBeLessThan(1e-6);
    expect(Math.abs(cam.position.y - 4)).toBeLessThan(1e-6);
    expect(Math.abs(cam.position.z - -8)).toBeLessThan(1e-6);
  });

  it('preserves body-frame offset under heading change', () => {
    const cam = new ChaseCameraState();
    cam.snap({ x: 0, y: 0, z: 0 }, 0);
    // Now move the vehicle to a new position and heading; run to steady state.
    const vehiclePos = { x: 25, y: 0, z: -10 };
    const vehicleHeading = Math.PI / 3;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 5; i += 1) {
      cam.step({ vehiclePos, vehicleHeading, dt });
    }
    // De-rotate the camera-vehicle vector by -heading and check it equals
    // the body-frame offset.
    const dx = cam.position.x - vehiclePos.x;
    const dy = cam.position.y - vehiclePos.y;
    const dz = cam.position.z - vehiclePos.z;
    const c = Math.cos(-vehicleHeading);
    const s = Math.sin(-vehicleHeading);
    const bodyX = dx * c + dz * s;
    const bodyZ = -dx * s + dz * c;
    expect(Math.abs(bodyX - DEFAULT_CHASE_PARAMS.offset.x)).toBeLessThan(1e-6);
    expect(Math.abs(dy - DEFAULT_CHASE_PARAMS.offset.y)).toBeLessThan(1e-6);
    expect(Math.abs(bodyZ - DEFAULT_CHASE_PARAMS.offset.z)).toBeLessThan(1e-6);
  });
});

describe('ChaseCameraState — input validation', () => {
  it('rejects negative or non-finite dt', () => {
    const cam = new ChaseCameraState();
    expect(() =>
      cam.step({ vehiclePos: { x: 0, y: 0, z: 0 }, vehicleHeading: 0, dt: -1 }),
    ).toThrow();
    expect(() =>
      cam.step({ vehiclePos: { x: 0, y: 0, z: 0 }, vehicleHeading: 0, dt: Number.NaN }),
    ).toThrow();
  });
});
