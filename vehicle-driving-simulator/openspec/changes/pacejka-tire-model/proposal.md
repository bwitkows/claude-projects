# pacejka-tire-model

## Why

R5 introduced the `TireModel` extension seam and a load-sensitive linear tire law `F_y = -cα · F_z · α`. The linear law is correct for small slip angles (≲ 5°) but unbounded — at large slip, it predicts arbitrarily large lateral force, which is unphysical. Real tires saturate: the friction available between rubber and road caps the lateral force at roughly `μ · F_z`. Beyond the saturation point, increasing slip *decreases* force (rubber sliding rather than gripping).

R6 replaces the linear law with **Pacejka's Magic Formula** — the standard semi-empirical tire model used in vehicle dynamics. The Magic Formula matches the linear regime at small slip and saturates smoothly to a peak at moderate slip, then falls off. This single change unlocks **controlled drift**: when the rear tires exceed their saturation slip, they lose grip while the fronts retain it, producing the lateral slide that defines drifting.

The TireModel seam established in R5 makes this a localized swap — no chassis, raycast, weight-transfer, or rendering code changes. Just a new tire model class and a default-tire switch in the chassis.

## What Changes

- Add `PacejkaTireModel(params)` implementing `TireModel`. The lateral force is the standard Magic Formula:
  ```
  F_y(α) = D · sin(C · atan(B·α − E·(B·α − atan(B·α))))
  ```
  with `D = μ · F_z` (peak), `B` (stiffness), `C` (shape), `E` (curvature). Sign convention identical to `LinearTireModel`: force opposes slip.
- Default Pacejka coefficients chosen so the linear regime matches R5's `LinearTireModel(10.1)` at zero slip:
  - `B = cα / (μ · C) = 10.1 / (1.0 · 1.3) = 7.77`
  - `C = 1.3` (typical lateral-force shape factor)
  - `D = μ · F_z` with `μ = 1.0`
  - `E = -0.2` (typical lateral-force curvature factor)
- The slope of `F_y` at `α = 0` equals `B · C · D = cα · F_z` exactly — handoff from R5's linear law is smooth at zero slip.
- Switch `DEFAULT_FOUR_WHEEL_PARAMS.tireModel` from `LinearTireModel(10.1)` to `PacejkaTireModel(default coefficients)`. `LinearTireModel` stays exported for tests and tools that want the linear regime explicitly.
- Vitest coverage for: linear-regime agreement at small slip; saturation (force bounded by `μ · F_z` for typical slip); peak location and value; sign opposition; replay equivalence within `1e-8`; F_z scaling at fixed slip.
- All R5/R4/R3/R2/R1/R0 tests continue to pass — the R5 test "total axle force at static load and small slip matches R4 equivalent within 0.5%" passes because Pacejka matches the linear law in that regime.
- KinematicVehicle, BicycleVehicle, FourWheelVehicle source files unchanged. The change is concentrated in `src/vehicle/tire.ts` (new class, default switch).

## Impact

- Affected specs:
  - **MODIFIED** `vehicle` (adds `PacejkaTireModel`, defaults switch, saturation requirement)
- Affected code: `src/vehicle/tire.ts` (PacejkaTireModel class added), `src/vehicle/four-wheel.ts` (default param swap), `src/vehicle/index.ts` (re-exports), `src/vehicle/tire.test.ts` and `src/vehicle/four-wheel.test.ts` (new R6 scenarios; existing R5 scenarios still pass).
- BREAKING: tools that constructed `FourWheelVehicle` with the default tire model and relied on the *unbounded* linear behavior at large slip will see saturation kick in. The R5 default (LinearTireModel) is still a one-line construction away.
- BicycleVehicle and KinematicVehicle continue to drive on a flat plane with R2/R1 dynamics; their tests are unchanged.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from `r5-complete`.
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - all R0/R1/R2/R3/R4/R5 tests still passing unchanged;
   - `PacejkaTireModel` tests asserting: at small slip (`|α| ≤ 0.01 rad`), `|F_pacejka − F_linear| / |F_linear| < 0.01` (linear-regime agreement); at large slip (`α = 0.4 rad`), `|F_pacejka| ≤ μ · F_z` (saturation); the force has a peak at some `0 < α_peak < π/2` and decreases thereafter; sign of `F_pacejka` opposes sign of `α`; force scales linearly in `F_z` at fixed slip;
   - replay equivalence over 240 sim steps with the new default tire model — all body-state fields within `1e-8`, all `state.wheels.<id>.{fz, slip}` within `1e-6`.
5. `npm run build` produces a single HTML entry that loads the JS bundle.
6. `npm run e2e` passes; both existing tests still hold.
7. `evals/R6/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`, including a `tokens` block.
8. All dependency versions in `package.json` remain exact-pinned. R6 SHALL NOT add new runtime dependencies.

A run is **partially passed** if (1)–(6) hold but (7)–(8) do not.
