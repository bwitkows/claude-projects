# kinematic-vehicle

## Why

R0 established the simulation, rendering, telemetry, and input scaffolding but contained no vehicle. R1 introduces the **first vehicle on the rung ladder** and — more importantly — the **`VehicleModel` extension seam** that R2 (bicycle), R4 (four-wheel raycast), R5 (linear tire), R6 (Pacejka), and R7 (suspension) will swap into.

The kinematic model is intentionally a toy: position is integrated directly from a forward-speed scalar and a heading angle, with no slip, no lateral forces, no tire friction. Its job is **architectural**, not physical — it proves the seam works, it gives downstream rungs something concrete to displace, and it lets the eval framework start collecting per-rung telemetry comparable across tools.

## What Changes

- Establish a new `vehicle` capability with a `VehicleModel` interface and a `KinematicVehicle` implementation.
- Wire the vehicle into the sim loop: input is sampled once per step, then `vehicle.step(dt, control)` runs before any other per-step work.
- Render the vehicle as a box mesh whose Three.js transform is read from `VehicleModel.state` once per render frame; the renderer SHALL NOT mutate vehicle state.
- Extend telemetry per-step records to include vehicle pose and forward speed (`x`, `z`, `heading`, `speed`).
- Add Vitest unit tests for `KinematicVehicle` integration (deterministic, exact under known inputs) and a determinism replay test that drives the vehicle via a `SyntheticInputSource` for ≥ 1 simulated second.
- Update the Playwright smoke test to confirm the vehicle visibly moves when the `w` key is held.

## Impact

- Affected specs:
  - **NEW** `vehicle`
  - **MODIFIED** `telemetry` (open-ended schema is exercised; field order pinned)
  - **MODIFIED** `rendering` (vehicle mesh added to scene)
- Affected code: `src/vehicle/` (new), `src/app/index.ts` (wires vehicle into loop), `src/render/scene.ts` (vehicle mesh + per-frame transform sync), `src/telemetry/*` (no API change; `app/` writes additional fields per record).
- BREAKING: none — R0 telemetry still has `t` and `step`; the additional fields are appended in stable order per the existing telemetry rules.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from the rung baseline (`r0-complete`).
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - a unit test that constructs `KinematicVehicle`, applies a recorded input sequence, and asserts the final pose against a closed-form expectation;
   - a determinism replay test driving the vehicle via `SyntheticInputSource` for ≥ 240 sim steps, comparing state field-by-field within `1e-8`.
5. `npm run build` produces a single HTML entry that loads the JS bundle (and WASM, by whatever mechanism `@dimforge/rapier3d-compat` chooses).
6. `npm run e2e` (Playwright) passes the smoke test and a new assertion that the vehicle's reported world-space `x` or `z` changes by more than 0.5 meters within 2 seconds of holding `w`.
7. CI runs all of the above.
8. `evals/R1/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`.
9. All dependency versions in `package.json` remain exact-pinned (no `^` or `~`); R1 SHALL NOT add new runtime dependencies (dev-only additions are permitted if justified in `design.md`).

A run is **partially passed** if (1)–(6) hold but (7)–(9) do not. Tag clearly in `evals/<rung>/<tool>/<attempt-id>/result.json`.
