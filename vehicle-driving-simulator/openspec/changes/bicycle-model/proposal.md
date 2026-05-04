# bicycle-model

## Why

R1 was a kinematic toy: throttle set forward speed, steer set yaw rate, no lateral velocity, no slip. R2 is where the simulator becomes a *vehicle dynamics* simulator. The linear bicycle model is the canonical first step — it introduces:

- a body-frame **lateral velocity** `vy` and a separate **yaw rate** `r`,
- per-axle **slip angles** `α_f, α_r`,
- per-axle **lateral tire forces** that depend on slip,
- **mass** and **yaw inertia** governing how the body responds.

This rung is also the architectural rehearsal that R5 (linear-tire-model) and R6 (Pacejka) build on. Once `vy`, `r`, slip angles, and per-axle force decomposition exist as first-class state, swapping the tire-force law is a localized change. R4 (four-wheel raycast) will further decompose per-axle forces into per-wheel forces; R2 lays the groundwork.

Driving feel changes substantively: turning radius now depends on speed, the vehicle slides into a turn rather than snapping, and at low speeds the slip-angle math degenerates and the model needs a low-speed fallback.

## What Changes

- Add a `BicycleVehicle` implementation alongside R1's `KinematicVehicle`. Both implement `VehicleModel`.
- The app's default vehicle SHALL switch from kinematic to bicycle. Kinematic stays in the source tree so its R1 tests still pass.
- Map `steer ∈ [-1, +1]` to a steering angle `δ` (max ~30°) at the front axle, instead of directly to a yaw rate.
- Integrate forces (longitudinal + lateral per axle) through mass and yaw inertia using semi-implicit Euler at the existing 240 Hz fixed timestep.
- Handle the low-speed singularity (`vx → 0`) by clamping the denominator in the slip-angle calc; document the choice and assert it does not introduce nondeterminism.
- Extend the per-step telemetry record with `vx, vy, yaw_rate, slip_f, slip_r`. `speed` (now `√(vx² + vy²)`) is preserved for backward-comparable telemetry against R1.
- Render the same vehicle box; the visible difference is the trajectory, not the asset.
- Add Vitest coverage for: small-angle slip linearization, steady-state cornering convergence, replay equivalence within `1e-8`, low-speed fallback determinism, KinematicVehicle's R1 tests still passing.
- Update the Playwright smoke test to allow either model (the assertion `|Δx|+|Δz| > 0.5 m` after holding `w` for 2 s holds for both).

## Impact

- Affected specs:
  - **MODIFIED** `vehicle` (adds `BicycleVehicle` + steering-angle / slip-angle / force-based requirements; existing kinematic requirements remain valid)
  - The `telemetry` capability is unchanged in spec — schema is open per R0; the new fields are stable-ordered automatically.
- Affected code: `src/vehicle/bicycle.ts` (new), `src/vehicle/bicycle.test.ts` (new), `src/vehicle/index.ts` (re-exports), `src/app/index.ts` (default switch), `src/main.ts` (no change), `tests/e2e/smoke.spec.ts` (assertion holds, no model assumption).
- BREAKING for telemetry consumers that pinned to the exact R1 CSV header — the header gains `slip_f, slip_r, vx, vy, yaw_rate` columns in alphabetical order. R1 column values for `heading, speed, x, z` remain present and continue to mean the same things.
- BREAKING for downstream tools that assumed `KinematicVehicle` was the runtime default — now `BicycleVehicle`. The kinematic class remains importable for tests and replay comparison.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from `r1-complete`.
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - all of R1's `KinematicVehicle` tests still passing;
   - a `BicycleVehicle` test that asserts `vy ≠ 0` and `r ≠ 0` develop within 1 simulated second of constant `steer=1, throttle=1` from rest;
   - a steady-state cornering test (constant inputs for 5 simulated seconds → `r` converges within ±5% of its expected steady-state value);
   - a replay-equivalence test that runs `BicycleVehicle` twice through a `SyntheticInputSource` for ≥ 240 steps; every state field SHALL match within `1e-8` per step;
   - a low-speed test confirming the slip-angle clamp does not produce `NaN`/`Infinity` and is identical across two replays.
5. `npm run build` produces a single HTML entry that loads the JS bundle.
6. `npm run e2e` passes; the existing `vehicle moves more than 0.5 m when W is held for 2 seconds` test still passes against the new default model.
7. `evals/R2/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`, including a `tokens` block.
8. All dependency versions in `package.json` remain exact-pinned. R2 SHALL NOT add new runtime dependencies.

A run is **partially passed** if (1)–(6) hold but (7)–(8) do not.
