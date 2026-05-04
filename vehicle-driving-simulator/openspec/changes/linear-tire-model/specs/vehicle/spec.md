# vehicle (delta)

## ADDED Requirements

### Requirement: TireModel extension seam

The system SHALL expose a `TireModel` interface with a `lateralForce(slip: number, fz: number, axle: 'front' | 'rear'): number` method. R5 ships one implementation, `LinearTireModel`. R6 (Pacejka) will replace the implementation without changing the call site.

#### Scenario: TireModel is consulted per-wheel each step

- WHEN `FourWheelVehicle.step` runs with all four wheels in contact
- THEN `tireModel.lateralForce` SHALL be invoked exactly four times per step (once per wheel)
- AND each call's `axle` argument SHALL match the wheel's axle (`'front'` for FL/FR, `'rear'` for RL/RR)

### Requirement: LinearTireModel — linear in slip and load

`LinearTireModel(cAlpha)` SHALL return `-cAlpha * fz * slip` regardless of axle. Default `cAlpha = 10.1 1/rad`.

#### Scenario: Force is linear in slip at fixed fz

- GIVEN `LinearTireModel(10.1)` and `fz = 5000`
- WHEN `lateralForce(0.01, 5000, 'front')` and `lateralForce(0.02, 5000, 'front')` are evaluated
- THEN the second SHALL equal twice the first within `1e-12`

#### Scenario: Force is linear in fz at fixed slip

- GIVEN `LinearTireModel(10.1)` and `slip = 0.05`
- WHEN `lateralForce(0.05, 5000, 'front')` and `lateralForce(0.05, 10000, 'front')` are evaluated
- THEN the second SHALL equal twice the first within `1e-12`

#### Scenario: Force opposes slip

- WHEN `lateralForce(slip, fz, axle)` is called with `slip > 0`, `fz > 0`
- THEN the returned value SHALL be negative
- AND `lateralForce(-slip, fz, axle)` SHALL equal the negation

### Requirement: Per-wheel slip angle

`FourWheelVehicle` SHALL compute a slip angle independently for each of the four wheels using the body-frame velocity evaluated at that wheel's position (`v_x = B_X + r·rz`, `v_z = B_Z − r·rx`), where `(rx, rz)` is the wheel's body-frame offset.

For front wheels, the steering angle `δ` SHALL be subtracted from the slip angle (the wheel rolls along its steered direction). Rear wheels SHALL use `δ_wheel = 0`.

The denominator `v_z` SHALL be clamped to `vMinSlip = 0.5 m/s` to keep slip angles finite at standstill.

#### Scenario: All wheel slips zero when vehicle moves straight without steer

- GIVEN a `FourWheelVehicle` accelerated to `vx > 5 m/s` driving straight (`steer = 0`, no perturbation)
- WHEN the vehicle is stepped with `throttle = 0.5, brake = 0, steer = 0` for one step
- THEN `state.wheels.fl.slip`, `.fr.slip`, `.rl.slip`, `.rr.slip` SHALL all equal 0 within `1e-12`

#### Scenario: Left and right wheel slips differ when yaw rate is non-zero

- GIVEN a `FourWheelVehicle` in a steady-state turn with `yawRate ≠ 0` and `vx > V_MAX/2`
- WHEN `state.wheels` is read
- THEN `state.wheels.fl.slip` SHALL NOT equal `state.wheels.fr.slip`
- AND the difference SHALL be approximately `slip_diff ≈ (slip_axle_avg) · (r·W) / (B_Z·2)` (small-angle, leading-order)

### Requirement: Per-wheel lateral force applied at wheel contact points

`FourWheelVehicle` SHALL compute lateral force per wheel via `tireModel.lateralForce(slip_wheel, fz_wheel, axle)` and apply each force at the corresponding wheel's world contact point in the body's `+X` direction. The per-axle force application at axle midpoints from R4 SHALL be removed.

#### Scenario: Doubling fz at one wheel doubles its lateral force at the same slip

- GIVEN a `FourWheelVehicle` and a `LinearTireModel`
- WHEN the wheel's `fz` doubles between two evaluations and its `slip` is identical
- THEN the lateral force computed at that wheel SHALL also double

#### Scenario: Total axle force at static load matches R4 within 0.5%

- GIVEN a `FourWheelVehicle` at rest on level terrain with `LinearTireModel(10.1)` (default)
- AND a synthetic small slip applied to the front axle (e.g., by setting heading slightly off the velocity direction)
- WHEN the per-wheel lateral forces at the front axle are summed
- THEN the sum SHALL equal `-80000 · α_axle` within 0.5%

### Requirement: WheelState slip field

`WheelState` SHALL include a `slip: number` field (radians) that reflects the per-wheel slip angle computed during the most recent `step`.

`state.slipF` and `state.slipR` SHALL be populated as the average of the front and rear wheel slips respectively, preserving R2/R4 telemetry semantics for tools that read those fields.

#### Scenario: state.wheels.<id>.slip is populated after step

- WHEN `FourWheelVehicle.step` returns
- THEN `state.wheels.fl.slip`, `.fr.slip`, `.rl.slip`, `.rr.slip` SHALL all be finite numbers

### Requirement: Determinism preserved with per-wheel forces

Two independent `FourWheelVehicle` instances with identical Rapier worlds and identical input sequences SHALL produce identical state field-by-field within `1e-8`, including each `state.wheels.<id>.slip`.

#### Scenario: Replay equivalence over 240 steps with mixed input

- GIVEN two parallel harnesses with identical setup
- AND a `SyntheticInputSource` providing 240 control events that exercise throttle, brake, and steer
- WHEN both vehicles are stepped through the same sequence (calling `step` then `world.step()` per sim step)
- THEN every numeric field of `state`, including each `state.wheels.<id>.{fz, slip}`, SHALL match across both runs within `1e-8` (`fz` and `slip` within `1e-6` to allow Rapier-derived contact-force noise)

### Requirement: BicycleVehicle and KinematicVehicle remain unchanged

R5 SHALL NOT modify `BicycleVehicle` or `KinematicVehicle` source. Their R1 and R2 tests SHALL continue to pass byte-for-byte unchanged.

#### Scenario: Prior vehicles still importable

- WHEN a test imports `KinematicVehicle` or `BicycleVehicle` from `src/vehicle/index.ts`
- THEN the imports SHALL succeed
- AND constructing each and stepping it SHALL produce results identical to R1 / R2 respectively
