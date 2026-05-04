# Design — kinematic-vehicle

## Context

R1 is the first rung that produces visible motion and the first that introduces the **swappable vehicle model**. Every later rung up to R7 is a different `VehicleModel` implementation slotted behind the same interface. Getting the seam right matters more than getting the kinematic math right.

## Goals / non-goals

Goals:
- Define `VehicleModel` as a small, pure-functional surface: `step(dt, control)` mutates internal state; `state` is a plain readable struct.
- Land a kinematic implementation whose behavior is closed-form and trivially testable, so the determinism baseline carries through R1.
- Keep the renderer a pure consumer of vehicle state — never a producer.

Non-goals:
- No tire forces, no slip, no lateral acceleration. Those are R5–R7.
- No suspension, no pitch, no roll. R7.
- No chase camera, no terrain. R3.
- No reverse gear. The kinematic model accepts brake-to-zero only; no negative speed.
- No collision response between the vehicle and the ground / world. The vehicle drives at a fixed ride height; ground is informational.

## Decisions

### Decision: VehicleModel interface

```ts
interface VehicleState {
  readonly x: number;       // world-space (m)
  readonly z: number;       // world-space (m); +z forward when heading = 0
  readonly heading: number; // radians, 0 = +Z, increasing counter-clockwise (right-hand y-up)
  readonly speed: number;   // m/s along heading; non-negative for kinematic
}

interface VehicleModel {
  readonly state: VehicleState;
  step(dt: number, control: ControlState): void;
  reset(state?: Partial<VehicleState>): void;
}
```

`step` is synchronous, side-effects internal state only, and is called once per sim step from the existing sim loop. The renderer reads `state` once per render frame and copies it into the Three.js mesh transform.

### Decision: Kinematic integration

Per step (`dt = 1/240` s):

```
v ← speed
desired_v ← throttle * V_MAX
v ← v + clamp(desired_v - v, -A_MAX*dt, A_MAX*dt)         // throttle accel
v ← max(0, v - brake * BRAKE_DECEL * dt)                    // brake decel
v ← max(0, v - DRAG * dt)                                   // coasting drag
yaw_rate ← steer * YAW_RATE_AT_VMAX * (v / V_MAX)
heading ← heading + yaw_rate * dt
x ← x + v * sin(heading) * dt
z ← z + v * cos(heading) * dt
```

Defaults: `V_MAX = 25 m/s` (~90 km/h), `A_MAX = 6 m/s²`, `BRAKE_DECEL = 12 m/s²`, `DRAG = 0.5 m/s²`, `YAW_RATE_AT_VMAX = 1.5 rad/s`.

Yaw rate scaled by `v / V_MAX` keeps the model from spinning in place — turning requires forward motion. This is the simplest physically-sensible behavior; the bicycle model in R2 will replace it with `v * tan(δ) / L`.

### Decision: Vehicle is NOT a Rapier rigid body in R1

The kinematic vehicle owns its own pose; Rapier is not consulted. R0's ground collider stays in the world for later rungs. Reasons:
- Avoids two sources of truth (Rapier transform vs. our `VehicleState`).
- Keeps the kinematic model trivially deterministic regardless of Rapier solver behavior.
- R4 (four-wheel raycast) is the right time to introduce a Rapier-backed body, because that's when the physics actually matter.

### Decision: Telemetry record fields

R1 appends `x, z, heading, speed` to each per-step record, in that order. The base fields (`t, step`) remain first; the additional fields are alphabetical per R0's stable-order rule. CSV header for R1 is therefore `t,step,heading,speed,x,z`.

### Decision: Module layout

```
src/vehicle/
  types.ts           VehicleModel, VehicleState interfaces
  kinematic.ts       KinematicVehicle implementation
  kinematic.test.ts  unit + determinism tests
  index.ts           barrel
```

`src/app/index.ts` constructs a `KinematicVehicle`, calls `vehicle.step(dt, control)` inside the existing `onStep`, and forwards `vehicle.state` to telemetry and the renderer.

## Risks

- **Vehicle rendering as a Three.js box only.** No model file loaded. If R3 or later rungs assume an OBJ/GLTF asset is in place, this rung doesn't provide one. Acceptable — the rung ladder owns terrain/camera/assets in later rungs.
- **Yaw scaling at low speed.** If the implementer scales yaw_rate purely by `v`, the test "vehicle turns when steered" must hold v above a small threshold, or the test passes trivially. Spec mandates a meaningful test (≥ 60 sim steps of throttle before steering).
- **Heading sign convention.** Different choices flip the sign of all turning tests. The convention above (+Z forward at heading=0, CCW positive) is fixed in the spec; implementations must follow.

## Open questions

- Should the kinematic model accept reverse via brake-past-zero? Defer; not needed for R1 acceptance and would muddy the determinism comparison. Decide in R2 after observing kinematic-only telemetry.
- Should `VehicleState` be exposed as immutable (object-frozen) or as a value type to discourage external mutation? Default to plain readonly fields and document the contract.
