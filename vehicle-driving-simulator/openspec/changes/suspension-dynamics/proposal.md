# suspension-dynamics

## Why

Through R4–R6, `FourWheelVehicle` ran on a chassis whose `y`, pitch, and roll were *locked*. Per-wheel `F_z` was computed quasi-statically from `m·a_x·h/L` formulas — physically motivated but a closed-form approximation, not a real load-transfer dynamic. The chassis floated above the terrain at a constant height, and accelerating produced no visible squat, braking no dive, cornering no roll.

R7 turns the chassis into a real **sprung mass on four spring/dampers**. This single change does several things at once:

- `y` translation is **unlocked** — the body settles by gravity onto the springs and floats over bumps.
- pitch and roll are **unlocked** — they emerge from forces applied at wheel positions and the body's distributed mass / inertia.
- per-wheel `F_z` is no longer computed from `a_x, a_y` formulas; it's the **spring + damper force** at each wheel, an actual physical quantity.
- chassis **dive under braking, squat under throttle, and roll under cornering** become visible and observable — this is the headline R7 deliverable.

The TireModel from R5/R6 keeps consuming `F_z` unchanged; only the source of `F_z` changes from quasi-static formula to spring force. KinematicVehicle and BicycleVehicle stay byte-for-byte unchanged.

## What Changes

- Add per-wheel suspension state: rest length `L_0`, stiffness `k`, damping `c`, current compression, current compression velocity. Defaults: `L_0 = 0.4 m`, `k = 70_000 N/m` per wheel, `c = 5_000 N·s/m` per wheel.
- Unlock chassis Y via `setEnabledTranslations(true, true, true, true)`.
- Unlock chassis pitch and roll via `setEnabledRotations(true, true, true, true)`.
- Re-enable gravity on the chassis body (`setGravityScale(1, true)`).
- Per sim step, raycast each wheel hardpoint downward; compute compression `x = max(0, L_0 − raycast_distance)` and compression velocity from frame-to-frame difference; compute spring force `F_spring = k·x + c·dx/dt` (positive when compressed); apply along world `+Y` at the wheel's contact point.
- Replace the quasi-static `F_z` formula entirely. `F_z_wheel = F_spring_wheel`.
- Set the initial body Y to the equilibrium pose: `y_eq = terrain.heightAt(0,0) + R_wheel + L_0 − x_rest + chassis_half_height`, where `x_rest = m·g / (4·k)` ≈ 5.25 cm.
- Heading extraction from the body quaternion changes from "yaw-only assumption" to "extract yaw component, accept small pitch/roll noise". Slip angles still computed from yaw-only body-frame velocity (R5/R6 semantics) — the small pitch/roll perturbation is bounded and the linear regime is robust to it.
- Add `compression: number` to `WheelState` (current spring compression, m). Telemetry CSV adds `c_fl, c_fr, c_rl, c_rr` columns.
- Vitest coverage: at rest on level terrain, `Σ F_spring` equals `m·g` within 1 N; under throttle, rear compression > front compression (squat); under braking, front > rear (dive); under cornering, outside compression > inside (roll); chassis pitch and roll both observable (> 0.001 rad) under their respective stimuli; replay equivalence within `1e-8` body, `1e-6` per-wheel.
- KinematicVehicle and BicycleVehicle untouched.

## Impact

- Affected specs:
  - **MODIFIED** `vehicle` (suspension model, dynamic `F_z`, unlocked rotations + Y, equilibrium pose, telemetry additions)
- Affected code: `src/vehicle/four-wheel.ts` (unlock rotations/translations, replace quasi-static `F_z` with spring dynamics, equilibrium init, body-velocity extraction handles small pitch/roll), `src/vehicle/types.ts` (`WheelState.compression` added), `src/vehicle/index.ts`, `src/vehicle/four-wheel.test.ts` (R7-specific scenarios; existing R4/R5/R6 scenarios continue to pass), `src/app/index.ts` (telemetry CSV gains the compression columns).
- BREAKING: tools that pinned to the R4 quasi-static `F_z` numerical values will see different `F_z` magnitudes — values are physically equivalent at steady state but transient response differs (the spring oscillates). The relative orderings the R4–R6 tests asserted (`F_z_rear > F_z_front` under throttle, etc.) hold against suspension dynamics.
- BREAKING for the telemetry CSV header — gains 4 new columns. Tools that pin to the R6 column order will see them shift.
- BicycleVehicle and KinematicVehicle continue to drive on a flat plane with R2/R1 dynamics; their tests are unchanged.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from `r6-complete`.
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - all R0/R1/R2/R3/R4/R5/R6 tests still passing unchanged (R4 weight-transfer assertions hold against R7 dynamics — they assert relative ordering, not absolute magnitudes);
   - `FourWheelVehicle` (R7) tests asserting: `Σ F_spring` at rest equals `m·g` within 1 N; chassis pitch under throttle is non-zero (rear-down, magnitude ≥ 0.01 rad after 1 s of full throttle); chassis pitch under braking is opposite sign (front-down) and similar magnitude; chassis roll under cornering at speed has the outside loaded; replay equivalence within `1e-8` for body state and `1e-6` for per-wheel `F_z, slip, compression` over 240 sim steps.
5. `npm run build` produces a single HTML entry that loads the JS bundle.
6. `npm run e2e` passes; both existing tests still hold.
7. `evals/R7/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`, including a `tokens` block.
8. All dependency versions in `package.json` remain exact-pinned. R7 SHALL NOT add new runtime dependencies.

A run is **partially passed** if (1)–(6) hold but (7)–(8) do not.
