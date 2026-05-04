# linear-tire-model

## Why

R4 introduced four wheels and per-wheel normal force `F_z`, but the lateral tire force still came from R2's bicycle math: a single per-axle slip angle and a fixed cornering stiffness `Cα` independent of `F_z`. That's a useful scaffold but isn't a tire model — a real tire's lateral force depends on:

- **slip angle at that wheel** (not at the axle midpoint), which differs left-vs-right at non-zero yaw rate due to the track-width contribution to wheel velocity;
- **normal force at that wheel** (load sensitivity), which is what makes weight transfer change the cornering balance — a wheel with more `F_z` produces more lateral force at the same slip.

R5 introduces the **linear regime** of a real tire: lateral force is **linear in slip** (no saturation — that's R6's Pacejka), but **proportional to normal force**:

```
F_y_wheel = -cα · F_z_wheel · α_wheel
```

`cα` is the cornering stiffness *coefficient* with units `1/rad` (force per unit normal force per radian of slip). The per-axle `Cα` from R2/R4 becomes `cα · F_z_axle` — equivalent at static load, but now responding to `F_z` changes from weight transfer.

This rung also moves force application from per-axle to **per-wheel contact points**, which is what makes per-wheel tire variation (different `cα` left vs right, eventually) produce the right yaw moment without needing a separate `a · F_yf − b · F_yr` torque calculation.

R6 (Pacejka) replaces the linear law `-cα · F_z · α` with the saturating Magic Formula `D · sin(C · atan(B · α − E · (B · α − atan(B · α))))` where `D = μ · F_z`. R5's per-wheel API is what R6 swaps the law into.

## What Changes

- Define a `TireModel` interface with `lateralForce(slip, fz, axle): number`. R5 ships one implementation: `LinearTireModel` with `cα` parameter, returning `-cα · fz · slip`.
- `FourWheelVehicle` gains a `tireModel` field on its params (default: `new LinearTireModel(DEFAULT_C_ALPHA_PER_N)`).
- `FourWheelVehicle.step` computes a slip angle **per wheel** using each wheel's body-frame velocity (`vx + ω×r` evaluated at that wheel), with the front wheels accounting for steering angle `δ`.
- Lateral force is computed per wheel via `tireModel.lateralForce(slip, fz, axle)` and applied at each wheel's world contact point. The per-axle `axle midpoint` force application from R4 is removed.
- `WheelState` gains a `slip: number` field (radians) so tests can verify per-wheel slip and downstream rungs can read it.
- The `state.slipF, state.slipR` fields remain populated as the average over each axle's pair of wheels — preserves R2/R4 telemetry compatibility.
- Default `cα = 10.1 1/rad` chosen so that per-axle lateral force at *static* load (`F_z_axle = m·g·b/L` for front, `m·g·a/L` for rear) matches R4's `Cα = 80000 N/rad`. Under weight transfer, the front and rear differ — that's the R5 signal.
- New Vitest coverage: per-wheel slip differs left-vs-right at non-zero yaw rate; lateral force scales linearly with `F_z`; total axle lateral force at static load matches R4's value within 0.5%; replay equivalence within `1e-8` over 240 sim steps.
- KinematicVehicle and BicycleVehicle stay byte-for-byte unchanged.

## Impact

- Affected specs:
  - **MODIFIED** `vehicle` (adds `TireModel` extension seam, `LinearTireModel`, per-wheel slip + force semantics, per-wheel `slip` in `WheelState`)
- Affected code: `src/vehicle/four-wheel.ts` (refactored force computation), `src/vehicle/tire.ts` (new — `TireModel` interface + `LinearTireModel` class), `src/vehicle/types.ts` (`WheelState.slip` added), `src/vehicle/index.ts` (re-exports), `src/vehicle/four-wheel.test.ts` (R4 tests stay; add R5-specific scenarios).
- BREAKING: none for the formal `VehicleState` shape — per-wheel slip is exposed via `state.wheels.<id>.slip` which is a new field, not a replacement.
- BREAKING for tools that constructed `FourWheelVehicle` and assumed the lateral force was applied at axle midpoints — R5 applies forces at wheel contact points, which is the same total axle force at zero lateral weight transfer but differs under cornering.
- BicycleVehicle and KinematicVehicle continue to drive on a flat plane with R2/R1 dynamics; their tests are unchanged.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from `r4-complete`.
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - all R0/R1/R2/R3/R4 tests still passing unchanged;
   - `LinearTireModel.lateralForce` tests asserting linearity in both slip and `fz` and the sign convention (force opposes slip);
   - `FourWheelVehicle` tests asserting per-wheel slip differs across the track when yaw rate is non-zero; lateral force at one wheel doubles when `F_z` doubles at the same slip; total axle lateral force at static load and small slip matches the R4-equivalent `−Cα · α` within 0.5%;
   - a replay-equivalence test that runs `FourWheelVehicle` twice through a `SyntheticInputSource` for ≥ 240 sim steps; every numeric state field, including each `state.wheels.<id>.slip`, SHALL match within `1e-8`.
5. `npm run build` produces a single HTML entry that loads the JS bundle.
6. `npm run e2e` passes; both existing tests still hold against the new tire law.
7. `evals/R5/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`, including a `tokens` block.
8. All dependency versions in `package.json` remain exact-pinned. R5 SHALL NOT add new runtime dependencies.

A run is **partially passed** if (1)–(6) hold but (7)–(8) do not.
