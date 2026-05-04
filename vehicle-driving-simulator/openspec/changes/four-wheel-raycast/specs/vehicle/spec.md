# vehicle (delta)

## ADDED Requirements

### Requirement: FourWheelVehicle is a Rapier rigid body

The system SHALL provide a `FourWheelVehicle` class implementing `VehicleModel` whose chassis pose, orientation, and velocities are integrated by the Rapier solver.

`FourWheelVehicle` SHALL:

- Construct a Rapier dynamic rigid body for the chassis at bootstrap.
- Lock pitch and roll rotations (`setEnabledRotations(false, true, false)`); only yaw is integrated.
- Attach a cuboid collider matching the visible vehicle dimensions.
- Read `state.x`, `state.z`, `state.heading`, `state.vx`, `state.vy`, `state.yawRate` from the Rapier body each step.

#### Scenario: Pitch and roll stay locked under all inputs

- GIVEN a `FourWheelVehicle` at rest on level terrain
- WHEN the vehicle is stepped through 240 sim steps with arbitrary control inputs (full throttle, full steer, full brake, mixed)
- THEN the body's pitch and roll angles SHALL remain at 0 within `1e-9` at every step

### Requirement: Per-wheel raycast against terrain

The vehicle SHALL maintain four wheel hardpoints — `fl`, `fr`, `rl`, `rr` — at fixed body-frame positions (front-left, front-right, rear-left, rear-right). Each step, every wheel SHALL raycast in the `-Y` world direction against the terrain collider and update `state.wheels.<id>` with `position` (world frame), `contact: boolean`, `contactDistance: number`, and `fz: number`.

#### Scenario: All wheels contact at rest on level terrain

- GIVEN a `FourWheelVehicle` at rest on the terrain (default heightmap), positioned so the chassis CoG is at `y = heightAt(0, 0) + ride_height`
- WHEN the vehicle is stepped once with neutral controls
- THEN `state.wheels.fl.contact`, `.fr.contact`, `.rl.contact`, `.rr.contact` SHALL all be `true`

### Requirement: Quasi-static weight transfer

The system SHALL compute each wheel's normal force `F_z` as a quasi-static load transfer derived from the chassis CoG's longitudinal and lateral acceleration, distributed across the four wheels.

`Σ F_z` over the four wheels at rest on level terrain SHALL equal `m · g` within 0.5 N.

#### Scenario: Sum of F_z equals weight at rest

- GIVEN a `FourWheelVehicle` at rest on level terrain
- WHEN the vehicle is stepped once with neutral controls
- THEN `state.wheels.fl.fz + .fr.fz + .rl.fz + .rr.fz` SHALL equal `m · g` within 0.5 N

#### Scenario: Static weight distribution favors the heavier axle

- GIVEN the default mass distribution `a = 1.2, b = 1.4` (CoG closer to front)
- WHEN the vehicle is stepped at rest
- THEN `(fz_fl + fz_fr)` SHALL be greater than `(fz_rl + fz_rr)` (front axle carries more static weight because `b > a`)
- AND `(fz_fl + fz_fr) - (fz_rl + fz_rr)` SHALL approximately equal `m · g · (b - a) / (a + b)` within 0.5 N

#### Scenario: Rearward weight transfer under throttle

- GIVEN a `FourWheelVehicle` at rest on level terrain
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = 0` for 240 sim steps
- THEN `fz_rl + fz_rr` SHALL exceed `fz_fl + fz_fr` at the final step (rear loaded under acceleration)

#### Scenario: Forward weight transfer under braking

- GIVEN a `FourWheelVehicle` accelerated to `vx > 5 m/s`
- WHEN the vehicle is stepped with `throttle = 0, brake = 1, steer = 0` for 60 sim steps (still moving)
- THEN `fz_fl + fz_fr` SHALL exceed `fz_rl + fz_rr` at the final step (front loaded under deceleration)

#### Scenario: Lateral weight transfer under cornering

- GIVEN a `FourWheelVehicle` accelerated to `vx > V_MAX / 2` driving straight
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = +1` for 240 sim steps
- THEN at the final step, the side opposite the turn (the outside of the turn) SHALL carry more weight than the inside

### Requirement: Forces applied at wheel positions

Longitudinal drive force SHALL be split between the rear wheels (rear-wheel drive). Brake force SHALL be split across all four wheels. Both SHALL be applied at the corresponding wheel contact points (or hardpoints when no contact), not at the chassis CoG.

Lateral tire force SHALL be applied at each axle midpoint (`(0, 0, +a)` for front, `(0, 0, -b)` for rear in body frame), using the same per-axle slip-angle math as `BicycleVehicle`. R5 will refine to per-wheel slip; R4 keeps it per-axle.

#### Scenario: No drive force when not in contact

- GIVEN a `FourWheelVehicle` whose rear wheels both report `contact = false`
- WHEN the vehicle is stepped with `throttle = 1`
- THEN no longitudinal drive force SHALL be applied to the body for that step

### Requirement: Determinism preserved

`FourWheelVehicle` SHALL produce identical state field-by-field within `1e-8` across two replays of the same input sequence in two independent Rapier worlds with identical setup.

#### Scenario: Replay equivalence with input

- GIVEN two `FourWheelVehicle` instances with identical initial state and identical Rapier world setup (same trimesh terrain collider)
- AND a `SyntheticInputSource` providing 240 control events
- WHEN both vehicles are stepped through the same sequence (calling `step` then `world.step()` per sim step)
- THEN at every sim step, every numeric field of `state` SHALL match across both runs within `1e-8`
- AND every `state.wheels.<id>.fz` SHALL match within `1e-6` (Rapier-derived contact forces have slightly larger noise than the body integrator)

### Requirement: Telemetry contribution

Each per-step telemetry record produced by the running app SHALL include `fz_fl`, `fz_fr`, `fz_rl`, `fz_rr` populated from `state.wheels.<id>.fz`. R2's `vx, vy, yawRate, slipF, slipR` remain populated.

#### Scenario: CSV header order with four-wheel telemetry

- WHEN `exportCsv()` is called against a non-empty buffer recorded by R4's app composition
- THEN the first line SHALL be `t,step,fz_fl,fz_fr,fz_rl,fz_rr,heading,slip_f,slip_r,speed,vx,vy,x,yaw_rate,z`

### Requirement: FourWheelVehicle is the runtime default

The application's composition root in `src/app/index.ts` SHALL construct a `FourWheelVehicle` (not a `BicycleVehicle`) as the active runtime model.

#### Scenario: Default vehicle is four-wheel

- WHEN the app is bootstrapped via `bootstrap()`
- THEN `appHandle.vehicle` SHALL be an instance of `FourWheelVehicle`

### Requirement: BicycleVehicle and KinematicVehicle remain preserved

R1's `KinematicVehicle` and R2's `BicycleVehicle` SHALL remain in the source tree, exported, and SHALL pass every R1 / R2 test scenario unchanged. R4 SHALL NOT modify their source files.

#### Scenario: Prior-rung vehicles still importable

- WHEN a test imports `KinematicVehicle` and `BicycleVehicle` from `src/vehicle/index.ts`
- THEN both imports SHALL succeed
- AND constructing each and stepping it SHALL produce results identical to R1 / R2 respectively
