# vehicle (delta)

## ADDED Requirements

### Requirement: VehicleModel extension seam

The system SHALL expose a `VehicleModel` interface that future capability deltas (R2 bicycle, R4 four-wheel, R5/R6 tire models, R7 suspension) replace without changing call sites in `src/app/` or `src/render/`.

A `VehicleModel` SHALL provide:

- `state: VehicleState` — readable, contains at least `x: number`, `z: number`, `heading: number`, `speed: number`.
- `step(dt: number, control: ControlState): void` — synchronous, side-effects internal state, called exactly once per sim step.
- `reset(state?: Partial<VehicleState>): void` — reposition the vehicle for tests / replay.

#### Scenario: Renderer reads only

- WHEN the renderer composes a frame
- THEN it SHALL read `vehicle.state` and copy values into the Three.js scene
- AND it SHALL NOT invoke `vehicle.step` nor write into `vehicle.state`

### Requirement: Kinematic forward motion

`KinematicVehicle` SHALL integrate forward motion such that holding `throttle = 1, brake = 0, steer = 0` from rest accelerates the vehicle toward its top speed `V_MAX` (default 25 m/s) along its heading.

#### Scenario: Vehicle accelerates forward under throttle

- GIVEN `vehicle.state = { x: 0, z: 0, heading: 0, speed: 0 }`
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = 0` for 1 sim second (240 steps at 240 Hz)
- THEN `state.speed` SHALL be > 5 m/s and ≤ V_MAX
- AND `state.z` SHALL be > 0
- AND `state.x` SHALL equal 0 within 1e-9 (no lateral drift in the kinematic model)
- AND `state.heading` SHALL equal 0 within 1e-9

### Requirement: Steering produces yaw, scaled by speed

`KinematicVehicle` SHALL turn under non-zero `steer` when moving and SHALL NOT yaw when stationary.

#### Scenario: Steer-while-stationary produces no yaw

- GIVEN a vehicle with `speed = 0`
- WHEN the vehicle is stepped with `throttle = 0, brake = 0, steer = 1` for 240 steps
- THEN `|state.heading|` SHALL remain < 1e-9

#### Scenario: Steer-while-moving produces yaw

- GIVEN a vehicle that has been throttled to `speed > V_MAX / 2`
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = 1` for 60 additional steps
- THEN `state.heading` SHALL increase by more than 0.05 rad
- AND `|state.x| + |state.z|` SHALL increase (the vehicle is moving while turning)

### Requirement: Brake-to-zero, no reverse

`KinematicVehicle` SHALL clamp `state.speed` to `[0, V_MAX]`. Brake input SHALL decelerate the vehicle but SHALL NOT push speed below zero.

#### Scenario: Brake stops, does not reverse

- GIVEN a vehicle with `speed = 10 m/s`
- WHEN the vehicle is stepped with `throttle = 0, brake = 1, steer = 0` until either `speed == 0` or 5 simulated seconds elapse
- THEN `state.speed` SHALL reach 0
- AND `state.speed` SHALL NOT become negative at any sampled step

### Requirement: Coast drag

`KinematicVehicle` SHALL apply a small drag deceleration (default `DRAG = 0.5 m/s²`) when `throttle = 0` and `brake = 0`, so the vehicle coasts to a stop in finite time.

#### Scenario: Vehicle coasts to a stop

- GIVEN a vehicle with `speed = 5 m/s`
- WHEN the vehicle is stepped with neutral controls for 30 simulated seconds
- THEN `state.speed` SHALL be 0

### Requirement: Determinism preserved

The vehicle integrator SHALL be deterministic: identical initial state and identical input sequence SHALL produce identical state field-by-field within float64 precision (`< 1e-8` per field after each step).

#### Scenario: Replay equivalence with input

- GIVEN two `KinematicVehicle` instances with identical initial state
- AND a `SyntheticInputSource` providing 240 control events
- WHEN both vehicles are stepped through the same sequence
- THEN at every sim step, `|Δx| + |Δz| + |Δheading| + |Δspeed|` SHALL be < 1e-8

### Requirement: Telemetry contribution

Each per-step telemetry record SHALL include `x, z, heading, speed` populated from `vehicle.state` *after* the step has executed (post-integration).

#### Scenario: CSV header order

- WHEN `exportCsv()` is called against a non-empty buffer recorded by R1's app composition
- THEN the first line SHALL be `t,step,heading,speed,x,z`
