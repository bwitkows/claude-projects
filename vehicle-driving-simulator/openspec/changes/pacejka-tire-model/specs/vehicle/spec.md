# vehicle (delta)

## ADDED Requirements

### Requirement: PacejkaTireModel implements TireModel

The system SHALL provide a `PacejkaTireModel(params)` class implementing `TireModel`. Its `lateralForce(slip, fz, axle): number` SHALL return the Magic Formula evaluation:

```
F_y(α) = -D · sin(C · atan(B·α − E·(B·α − atan(B·α))))
```

with `D = μ · F_z`. The leading minus sign ensures the force opposes slip, matching `LinearTireModel`'s sign convention.

`PacejkaParams` SHALL include `mu`, `B`, `C`, `E`. `DEFAULT_PACEJKA_PARAMS` SHALL be `{ mu: 1.0, B: 7.77, C: 1.3, E: -0.2 }` chosen so the linear regime at zero slip matches `LinearTireModel(10.1)` exactly.

#### Scenario: Linear-regime agreement at small slip

- GIVEN `pacejka = new PacejkaTireModel(DEFAULT_PACEJKA_PARAMS)` and `linear = new LinearTireModel(10.1)`
- WHEN both are evaluated at `slip = 0.005, fz = 5000`
- THEN `|pacejka.lateralForce(0.005, 5000, 'front') − linear.lateralForce(0.005, 5000, 'front')| / |linear.lateralForce(0.005, 5000, 'front')| < 0.01`
- AND the same SHALL hold at `slip = 0.01`

#### Scenario: Saturation at large slip

- GIVEN `pacejka = new PacejkaTireModel(DEFAULT_PACEJKA_PARAMS)` and `fz = 5000`
- WHEN `pacejka.lateralForce(0.4, 5000, 'front')` is evaluated (slip ~23°, well past peak)
- THEN `|F_y| ≤ μ · F_z + 1` (saturation at the peak — the +1 accounts for floating-point headroom)

#### Scenario: Force has a finite peak

- GIVEN `pacejka = new PacejkaTireModel(DEFAULT_PACEJKA_PARAMS)` and `fz = 5000`
- WHEN `pacejka.lateralForce` is sampled at slip values from 0 to 1.0 rad in 0.01 increments
- THEN the magnitude SHALL be a unimodal function of slip with a peak at some `α_peak ∈ (0, π/2)`
- AND the magnitude at slips beyond `2 · α_peak` SHALL be less than the magnitude at `α_peak`

#### Scenario: Sign opposes slip

- WHEN `pacejka.lateralForce(slip, fz, axle)` is called with `slip > 0` and `fz > 0`
- THEN the returned value SHALL be negative
- AND `pacejka.lateralForce(-slip, fz, axle)` SHALL equal the negation within `1e-12`

#### Scenario: Force is linear in fz at fixed slip

- WHEN `pacejka.lateralForce(0.05, 5000, 'front')` and `pacejka.lateralForce(0.05, 10000, 'front')` are evaluated
- THEN the second SHALL equal twice the first within `1e-12`

#### Scenario: Force is zero when fz is zero

- WHEN `pacejka.lateralForce(slip, 0, axle)` is called for any slip and axle
- THEN the returned value SHALL be exactly `0` (or `-0` from the formula's sign choice — both are acceptable)

### Requirement: Default tire model is Pacejka

`DEFAULT_FOUR_WHEEL_PARAMS.tireModel` SHALL be a `PacejkaTireModel` instance with `DEFAULT_PACEJKA_PARAMS`. The R5 default (`LinearTireModel`) SHALL still be exported from `src/vehicle/index.ts` so callers may construct it explicitly.

#### Scenario: Default vehicle uses Pacejka

- WHEN `bootstrap()` constructs a `FourWheelVehicle` without overriding `tireModel`
- THEN `appHandle.vehicle.p.tireModel` SHALL be a `PacejkaTireModel` (or behaviorally indistinguishable from one)

### Requirement: Determinism preserved with Pacejka

The Pacejka force calculation SHALL be a pure function of `(slip, fz, axle)` with no random sampling, no time-varying parameters, no hidden state. Two parallel `FourWheelVehicle` runs through identical input sequences SHALL match every state field within `1e-8` (per-wheel forces and slips within `1e-6`) over 240 sim steps.

#### Scenario: Replay equivalence with Pacejka default

- GIVEN two parallel `FourWheelVehicle` harnesses with default tire model
- AND a `SyntheticInputSource` providing 240 control events that exercise throttle, brake, steer
- WHEN both are stepped through the same sequence
- THEN every numeric state field SHALL match within `1e-8`
- AND each `state.wheels.<id>.{fz, slip}` SHALL match within `1e-6`

### Requirement: Backward-compatible R5 tests

R5's tests for `FourWheelVehicle` and `LinearTireModel` SHALL continue to pass without modification. R5's "total front-axle lateral force at static load matches R4 within 0.5%" works because Pacejka matches Linear in the small-slip regime where that test operates.

#### Scenario: R5 tests pass against Pacejka default

- WHEN the R5 four-wheel test suite runs against the R6 default tire model
- THEN every R5 test SHALL pass without modification

### Requirement: BicycleVehicle and KinematicVehicle remain unchanged

R6 SHALL NOT modify `BicycleVehicle` or `KinematicVehicle`. Their R1/R2 tests pass byte-for-byte unchanged.

#### Scenario: Prior vehicles still importable

- WHEN tests import `KinematicVehicle` or `BicycleVehicle`
- THEN the imports SHALL succeed
- AND constructing each and stepping it SHALL produce R1/R2-equivalent results
