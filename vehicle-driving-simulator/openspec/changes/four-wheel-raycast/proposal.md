# four-wheel-raycast

## Why

R0–R3 ran the vehicle as a self-integrated state struct. The Rapier world was constructed in R0 but kept idle — no rigid body, no contacts, no integration role. The bicycle model in R2 produced lateral dynamics; R3 made the world look like terrain but the vehicle still drove on a 2D plane.

R4 is the architectural pivot the design docs flagged from R0:

- The vehicle becomes a **Rapier rigid body**. Position, orientation, and velocities are integrated by Rapier's solver, not by hand.
- The R3 terrain becomes a **physical surface**. Each of the vehicle's four wheels does a downward raycast against the heightmap-derived collider; the per-wheel ground distance and surface normal become first-class state.
- **Weight transfer** appears as a quasi-static per-wheel normal force `F_z` that responds to longitudinal and lateral acceleration. R5 (linear-tire) and R6 (Pacejka) consume this as the saturating tire-force capacity; R7 (suspension) replaces the quasi-static formula with spring/damper dynamics.

The driving feel changes substantively: the chassis tracks the terrain rather than ghosting through it, and the heavier rear under throttle / heavier front under braking is observable in telemetry. R5–R7 then refine how those per-wheel normal forces translate into traction.

## What Changes

- New `FourWheelVehicle` implementation alongside R1's `KinematicVehicle` and R2's `BicycleVehicle`. All three implement `VehicleModel`.
- `FourWheelVehicle` owns a Rapier dynamic rigid body for the chassis, locked to yaw-only rotation (no pitch, no roll — those return in R7 with suspension). The body is wired into the same Rapier world R0 set up.
- The R3 heightmap is materialized into a Rapier collider so per-wheel raycasts hit a real surface. Implementation choice deferred to design.md (likely: a heightfield collider or a triangle-mesh collider derived from the terrain mesh).
- Each sim step, `FourWheelVehicle` does: per-wheel raycast → quasi-static load transfer → per-wheel longitudinal / lateral force computation → applied as `addForceAtPoint` on the body → Rapier integrates → state read back from the body.
- `FourWheelVehicleState` extends `BicycleVehicleState` with a `wheels` block (FL, FR, RL, RR each carrying `position`, `contact`, `contactDistance`, `fz`).
- The app's default vehicle SHALL switch from `BicycleVehicle` to `FourWheelVehicle`. Both prior implementations stay in the source tree and pass their R1/R2 tests unchanged.
- Telemetry per-step records gain `fz_fl, fz_fr, fz_rl, fz_rr` (per-wheel normal force, N). R2's `vx, vy, yawRate, slipF, slipR` remain for backward comparison; the bicycle-style slip angles are still meaningful as front/rear *axle* averages even when forces are computed per-wheel.
- Vitest coverage for: per-wheel contact on level terrain, F_z sum equals weight at rest, F_z shifts rearward under throttle, F_z shifts to outside wheels under cornering, replay equivalence within `1e-8` across Rapier integration.
- Playwright smoke continues to pass: page boots, FPS > 30, vehicle moves > 0.5 m on `w` hold.

## Impact

- Affected specs:
  - **MODIFIED** `vehicle` (adds `FourWheelVehicle`, per-wheel state, wheel-position force application, weight-transfer requirements)
- Affected code: `src/vehicle/four-wheel.ts` (new), `src/vehicle/four-wheel.test.ts` (new), `src/vehicle/index.ts` (re-exports), `src/physics/world.ts` (terrain collider added), `src/app/index.ts` (default switch + physics wiring), `tests/e2e/smoke.spec.ts` (no assertion change required).
- BREAKING for telemetry consumers pinning to R2's exact CSV header — header gains `fz_fl, fz_fr, fz_rl, fz_rr` columns in alphabetical order. The R0–R2 columns are unchanged.
- BREAKING for the assumption that the vehicle is *not* a Rapier rigid body. Anyone reading `state.x, state.z, state.heading` from `appHandle.vehicle` continues to get sensible values, but the semantics are now "read from the Rapier body" rather than "self-integrated".
- BicycleVehicle and KinematicVehicle remain importable, are unchanged, and pass their R1/R2 tests unchanged.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from `r3-complete`.
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - all R0/R1/R2/R3 tests still passing unchanged;
   - `FourWheelVehicle` tests asserting all four wheels report contact at rest on level terrain; sum of `fz` over wheels equals `m * g` within 0.5 N at rest; under sustained throttle, `fz_rl + fz_rr > fz_fl + fz_fr` after 1 s (rearward weight transfer); under sustained `steer = 1` at speed, the right-side `fz` exceeds the left-side `fz` (lateral weight transfer);
   - a replay-equivalence test that runs `FourWheelVehicle` twice through a `SyntheticInputSource` for ≥ 240 sim steps; every state field SHALL match within `1e-8` per step.
5. `npm run build` produces a single HTML entry that loads the JS bundle.
6. `npm run e2e` passes; both existing tests still hold against the new default vehicle.
7. `evals/R4/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`, including a `tokens` block.
8. All dependency versions in `package.json` remain exact-pinned. R4 SHALL NOT add new runtime dependencies — it consumes the Rapier dependency that has been in `package.json` since R0.

A run is **partially passed** if (1)–(6) hold but (7)–(8) do not.
