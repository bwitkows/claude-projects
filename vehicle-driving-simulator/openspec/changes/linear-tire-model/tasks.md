# Tasks — linear-tire-model

## 1. Tire model module (`src/vehicle/tire.ts`)
- [ ] 1.1 Define `TireModel` interface with `lateralForce(slip: number, fz: number, axle: 'front' | 'rear'): number`
- [ ] 1.2 Implement `LinearTireModel` with `cAlpha` parameter (1/rad), returning `-cAlpha * fz * slip` regardless of axle
- [ ] 1.3 Export `DEFAULT_C_ALPHA_PER_N = 10.1`
- [ ] 1.4 Re-export from `src/vehicle/index.ts`

## 2. WheelState and FourWheelVehicleState (`src/vehicle/types.ts`)
- [ ] 2.1 Add `readonly slip: number` to `WheelState`
- [ ] 2.2 Update `NEUTRAL_FOUR_WHEEL_STATE.wheels.*` to set `slip: 0`

## 3. FourWheelVehicle refactor (`src/vehicle/four-wheel.ts`)
- [ ] 3.1 Add `tireModel?: TireModel` to `FourWheelVehicleParams`; default = `new LinearTireModel(DEFAULT_C_ALPHA_PER_N)`
- [ ] 3.2 In `step`, replace per-axle slip angle calculation with per-wheel slip angles using the body-frame velocity at each wheel (`v_x_at_wheel = B_X + r·rz`, `v_z_at_wheel = B_Z − r·rx`)
- [ ] 3.3 Front wheels' `δ_wheel = δ`, rear wheels' `δ_wheel = 0`
- [ ] 3.4 Compute per-wheel lateral force via `tireModel.lateralForce(slipWheel, fzWheel, axle)`
- [ ] 3.5 Apply lateral force at each wheel's world contact point, in body `+X` direction
- [ ] 3.6 Remove the per-axle force application at axle midpoints from R4
- [ ] 3.7 Populate `state.wheels.<id>.slip` and update `state.slipF, state.slipR` to be the per-axle averages
- [ ] 3.8 Drive force application at rear wheels and brake force at all four are unchanged from R4
- [ ] 3.9 Force/torque reset at the top of `step` (R4's resetForces fix) is unchanged from R4

## 4. Tests
- [ ] 4.1 `src/vehicle/tire.test.ts`: `LinearTireModel.lateralForce` linearity in slip and fz; sign opposes slip
- [ ] 4.2 `src/vehicle/four-wheel.test.ts` additions: per-wheel slip differs left-vs-right at non-zero yaw rate; doubling fz at the same slip doubles the per-wheel lateral force; total front-axle lateral force at static load and small slip matches `−Cα · α` (Cα = 80,000) within 0.5%; per-wheel `slip` is 0 when vehicle is at rest and steer is 0
- [ ] 4.3 Replay-equivalence test extended: wheel `slip` matches across two parallel runs within `1e-8`
- [ ] 4.4 R4's existing weight-transfer / contact / pose-lock / no-NaN / replay tests continue to pass unchanged

## 5. App composition (`src/app/`)
- [ ] 5.1 No code changes — default `tireModel` is `LinearTireModel(10.1)` and the app constructs `FourWheelVehicle` without specifying one
- [ ] 5.2 Telemetry CSV header unchanged from R4

## 6. End-to-end smoke
- [ ] 6.1 Both existing e2e tests continue to pass

## 7. Eval artifacts
- [ ] 7.1 Confirm baseline is `r4-complete`; resulting commit becomes `r5-complete`
- [ ] 7.2 Record `evals/R5/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}` including a `tokens` block

## 8. Verification
- [ ] 8.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 8.2 No new runtime dependencies; all versions still exact-pinned
- [ ] 8.3 R0/R1/R2/R3/R4 tests all still pass without modification
