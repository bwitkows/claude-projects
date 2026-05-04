# vehicle (delta)

## ADDED Requirements

### Requirement: Bicycle vehicle model

The system SHALL provide a `BicycleVehicle` class implementing `VehicleModel` whose dynamics include lateral velocity, yaw rate, slip angles at front and rear axles, and per-axle linear lateral tire forces governed by mass and yaw inertia.

`BicycleVehicleState` SHALL extend the base `VehicleState` with at least:

- `vx: number` — body-frame longitudinal velocity (m/s, ≥ 0).
- `vy: number` — body-frame lateral velocity (m/s, sign convention: positive when the body slides toward +Y in vehicle frame, equivalent to the "right" side of the car at heading 0).
- `yawRate: number` — radians per second, CCW positive (matches `heading` sign convention).

`speed` SHALL equal `sqrt(vx² + vy²)` and SHALL remain non-negative.

#### Scenario: Lateral velocity develops under steering at speed

- GIVEN a `BicycleVehicle` accelerated to `speed > V_MAX / 2`
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = 1` for 240 additional steps (1 simulated second)
- THEN `|vy|` SHALL exceed 0.05 m/s
- AND `|yawRate|` SHALL exceed 0.1 rad/s

#### Scenario: No lateral motion under pure forward acceleration

- GIVEN a `BicycleVehicle` at rest at the origin with `heading = 0`
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = 0` for 240 steps
- THEN `vy` SHALL equal 0 within `1e-9`
- AND `yawRate` SHALL equal 0 within `1e-9`
- AND `x` SHALL equal 0 within `1e-9`
- AND `heading` SHALL equal 0 within `1e-9`

### Requirement: Steering input maps to a steering angle

The bicycle model SHALL interpret `control.steer ∈ [-1, +1]` as a normalized steering angle, with `steer = +1` corresponding to a maximum steering angle `δ_MAX` (default `0.524 rad ≈ 30°`) at the front axle. The yaw rate SHALL be an emergent output of the dynamics, NOT a direct function of `steer`.

#### Scenario: Steering angle is the input, not the yaw rate

- GIVEN two `BicycleVehicle` instances in identical state at high speed
- WHEN one is stepped with `steer = 0.5` for one step and the other with `steer = 1.0` for one step
- THEN both vehicles' `yawRate` SHALL change in the same sign
- AND the vehicle stepped with `steer = 1.0` SHALL have a larger `|yawRate|` change than the one stepped with `steer = 0.5`
- AND the relationship between `steer` and steady-state `yawRate` SHALL depend on `speed`

### Requirement: Slip-angle telemetry

Each per-step telemetry record produced by the running app SHALL include `slip_f` and `slip_r` (radians) in addition to the R1 fields and the bicycle state fields. `slip_f` is the front-axle slip angle; `slip_r` is the rear-axle slip angle, both signed using the same convention as `vy`.

#### Scenario: CSV header order with bicycle telemetry

- WHEN `exportCsv()` is called against a non-empty buffer recorded by R2's app composition
- THEN the first line SHALL be `t,step,heading,slip_f,slip_r,speed,vx,vy,x,yaw_rate,z`

### Requirement: Steady-state cornering converges

Under constant input over multiple seconds, the bicycle model SHALL converge to a steady cornering state — yaw rate, lateral velocity, and slip angles SHALL each approach finite values and stop changing significantly.

#### Scenario: Yaw rate stabilizes under constant inputs

- GIVEN a `BicycleVehicle` at rest
- WHEN it is stepped with `throttle = 0.5, brake = 0, steer = 0.3` for 5 simulated seconds (1200 steps)
- THEN over the final simulated second, the change in `yawRate` SHALL be less than 5% of the mean `yawRate` over that second
- AND `yawRate` SHALL be non-zero (a turn is in progress)

### Requirement: Low-speed singularity handled deterministically

The slip-angle calculation involves division by `vx`, which is undefined at standstill. The system SHALL use a clamped denominator `max(vx, V_MIN_SLIP)` (default `0.5 m/s`) so that slip angles remain finite at any speed, and SHALL produce identical state across two replays of the same input sequence whether or not the vehicle is at low speed.

#### Scenario: No NaN at standstill under any input

- GIVEN a `BicycleVehicle` at rest
- WHEN the vehicle is stepped with arbitrary control sequences (including `steer = 1` while throttle is 0) for 240 steps
- THEN no field of `vehicle.state` SHALL be `NaN` or `±Infinity` at any step

#### Scenario: Replay equivalence holds across the low-speed regime

- GIVEN two `BicycleVehicle` instances at rest
- AND a `SyntheticInputSource` that begins with steering input while `vx < V_MIN_SLIP`, then ramps up the throttle
- WHEN both vehicles are stepped through 600 sim steps (2.5 s)
- THEN at every step `|Δvx| + |Δvy| + |Δr| + |Δheading| + |Δx| + |Δz|` SHALL be less than `1e-8`

### Requirement: BicycleVehicle is the runtime default

The application's composition root in `src/app/index.ts` SHALL construct a `BicycleVehicle` (not a `KinematicVehicle`) as the active runtime model.

#### Scenario: Default vehicle is bicycle

- WHEN the app is bootstrapped via `bootstrap()`
- THEN `appHandle.vehicle` SHALL be an instance of `BicycleVehicle`

### Requirement: KinematicVehicle remains preserved

R1's `KinematicVehicle` SHALL remain in the source tree, exported, and SHALL pass every R1 test scenario unchanged.

#### Scenario: KinematicVehicle still imports and runs

- WHEN a test imports `KinematicVehicle` from `src/vehicle/index.ts`
- THEN the import SHALL succeed
- AND constructing one and stepping it SHALL produce the same results as in R1

### Requirement: Tire force is an injection point

The per-axle lateral force calculation SHALL be exposed as a parameter on `BicycleVehicleParams` (default: `(α, _axle, params) => -params.cAlpha * α`). Future rungs (R5 linear-tire, R6 Pacejka) SHALL replace the function without altering integration code.

#### Scenario: Replacing the tire force function is local

- GIVEN a `BicycleVehicle` constructed with `params.tireFn = customFn`
- WHEN the vehicle is stepped
- THEN `customFn` SHALL be invoked twice per step (once per axle)
- AND the lateral forces fed into the integrator SHALL be the values returned by `customFn`
