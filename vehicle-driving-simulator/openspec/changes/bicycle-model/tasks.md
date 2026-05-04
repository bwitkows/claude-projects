# Tasks — bicycle-model

## 1. Vehicle module additions (`src/vehicle/`)
- [ ] 1.1 Add `BicycleVehicleState` extending the R1 `VehicleState` shape with `vx`, `vy`, `yawRate` and update `VehicleState` to be a structural superset (or expose a `BicycleVehicleState` alongside)
- [ ] 1.2 Implement `BicycleVehicle` in `src/vehicle/bicycle.ts` per the equations and parameters in `design.md`
- [ ] 1.3 Expose a `tireFn(slipAngle, axle, params) => number` injection point on `BicycleVehicleParams`, defaulting to the linear `-Cα * α` formula
- [ ] 1.4 Re-export `BicycleVehicle`, `DEFAULT_BICYCLE_PARAMS`, `BicycleVehicleState` from `src/vehicle/index.ts`
- [ ] 1.5 Vitest: small-input checks — `vy=0, r=0, slip=0` after one step from rest with neutral controls
- [ ] 1.6 Vitest: at `speed > V_MAX/2`, applying `steer=1` for 1 simulated second produces `|vy| > 0.05 m/s` and `|r| > 0.1 rad/s`
- [ ] 1.7 Vitest: steady-state cornering — constant `throttle=0.5, steer=0.3` for 5 simulated seconds yields a yaw rate that converges (Δr per second < 1% of mean)
- [ ] 1.8 Vitest: replay equivalence within `1e-8` per state field per step over 240+ steps with a `SyntheticInputSource`
- [ ] 1.9 Vitest: low-speed (`speed < V_MIN_SLIP`) behavior — no `NaN`/`Infinity`, identical across two replays
- [ ] 1.10 Vitest: KinematicVehicle's R1 tests SHALL still pass unmodified

## 2. App composition (`src/app/`)
- [ ] 2.1 Switch the default constructor from `new KinematicVehicle()` to `new BicycleVehicle()`
- [ ] 2.2 Telemetry record per step SHALL additionally include `vx, vy, yaw_rate, slip_f, slip_r`
- [ ] 2.3 `speed` field in telemetry SHALL equal `sqrt(vx² + vy²)`
- [ ] 2.4 Verify CSV header (when buffer non-empty) is `t,step,heading,slip_f,slip_r,speed,vx,vy,x,yaw_rate,z`
- [ ] 2.5 The exposed `AppHandle.vehicle` typing SHALL be `VehicleModel` (not `BicycleVehicle`) — callers SHOULD NOT depend on the concrete model

## 3. Render
- [ ] 3.1 No render changes required — vehicle box continues to read `{x, z, heading}` from `vehicle.state`. Confirm visually that the new dynamics produce a different trajectory at speed when steering, but no asset / camera changes are in scope

## 4. End-to-end smoke
- [ ] 4.1 The R1 test "vehicle moves more than 0.5 m when W is held for 2 seconds" SHALL still pass against the bicycle default
- [ ] 4.2 No new e2e test required by R2 (the bicycle dynamics are validated in unit tests; visible motion suffices for the smoke layer)

## 5. Eval artifacts (per `MEASUREMENT.md`)
- [ ] 5.1 Confirm baseline is `r1-complete`; the resulting commit becomes `r2-complete` after archive
- [ ] 5.2 Record `evals/R2/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}` including a `tokens` block (`measured` if available, else `estimated` with `basis`)

## 6. Verification
- [ ] 6.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 6.2 Determinism replay test runs in <5 s
- [ ] 6.3 No new runtime dependencies in `package.json`; all versions still exact-pinned
