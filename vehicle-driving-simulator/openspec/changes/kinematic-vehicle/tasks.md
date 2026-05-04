# Tasks — kinematic-vehicle

## 1. Vehicle capability (`src/vehicle/`)
- [ ] 1.1 Define `VehicleState` and `VehicleModel` interfaces in `src/vehicle/types.ts`
- [ ] 1.2 Implement `KinematicVehicle` in `src/vehicle/kinematic.ts` per the integration formulas in `design.md`
- [ ] 1.3 Expose `reset(partialState?)` so tests can position the vehicle deterministically
- [ ] 1.4 Vitest: closed-form integration test — given a recorded input sequence, assert final `x, z, heading, speed` against an expected pose computed from the same formulas
- [ ] 1.5 Vitest: replay-equivalence test — drive the vehicle via `SyntheticInputSource` for ≥ 240 steps; two independent runs SHALL match field-by-field within `1e-8`
- [ ] 1.6 Vitest: vehicle does NOT turn when stationary (`steer = 1, throttle = 0` → heading change < 1e-9)

## 2. Sim loop integration (`src/app/`)
- [ ] 2.1 Construct a `KinematicVehicle` in `bootstrap()`
- [ ] 2.2 Inside `onStep`, call `vehicle.step(dt, control)` after sampling input and before recording telemetry
- [ ] 2.3 Telemetry record per step SHALL include `t, step, x, z, heading, speed`
- [ ] 2.4 The CSV header for a non-empty buffer SHALL be `t,step,heading,speed,x,z`

## 3. Rendering (`src/render/`)
- [ ] 3.1 Add a vehicle box mesh to the scene (e.g. 1.8 × 1.0 × 4.0 m, distinct color)
- [ ] 3.2 Per render frame, set the box's position from `vehicle.state.{x, z}` and rotation from `state.heading` (only after the renderer is given a reference to the vehicle state)
- [ ] 3.3 Renderer SHALL NOT call `vehicle.step` or mutate `vehicle.state`

## 4. End-to-end smoke
- [ ] 4.1 Update `tests/e2e/smoke.spec.ts` to also: focus the page, hold `w` for 2 s, then assert that telemetry reports `|Δx| + |Δz| > 0.5 m`
- [ ] 4.2 Existing FPS > 30 assertion still holds

## 5. Eval artifacts (per `MEASUREMENT.md`)
- [ ] 5.1 Confirm baseline is `r0-complete`; the resulting commit becomes `r1-complete` after archive
- [ ] 5.2 Record `evals/R1/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}`

## 6. Verification
- [ ] 6.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 6.2 Determinism test runs in <5 s
- [ ] 6.3 No new runtime dependencies in `package.json`; all versions still exact-pinned
