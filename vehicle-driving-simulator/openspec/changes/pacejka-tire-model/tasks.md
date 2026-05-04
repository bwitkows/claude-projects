# Tasks — pacejka-tire-model

## 1. PacejkaTireModel (`src/vehicle/tire.ts`)
- [ ] 1.1 Define `PacejkaParams` interface with `mu, B, C, E`
- [ ] 1.2 Define `DEFAULT_PACEJKA_PARAMS = { mu: 1.0, B: 7.77, C: 1.3, E: -0.2 }`
- [ ] 1.3 Implement `PacejkaTireModel(params)` with `lateralForce(slip, fz, axle): number` returning `-D · sin(C · atan(B·α − E·(B·α − atan(B·α))))` where `D = mu · fz`. Return 0 when `fz <= 0`.
- [ ] 1.4 Re-export from `src/vehicle/index.ts`

## 2. PacejkaTireModel tests (`src/vehicle/tire.test.ts` additions)
- [ ] 2.1 At small slip (`α = 0.005, 0.01`), Pacejka and Linear agree within 1%
- [ ] 2.2 At large slip (`α = 0.4`), `|F_pacejka| < μ · F_z + 1 N` (saturation, with small numerical headroom)
- [ ] 2.3 Force has a peak at some `α_peak ∈ (0, π/2)` and decreases for `α > α_peak`
- [ ] 2.4 Sign opposes slip (positive slip → negative force)
- [ ] 2.5 Linear in `F_z` at fixed slip (per the Magic Formula's `D = μ · F_z` factor)
- [ ] 2.6 Returns 0 when `fz = 0` regardless of slip
- [ ] 2.7 Default-params slope at zero slip equals `cα · F_z = 10.1 · F_z` within 1e-9 (analytic verification of B, C, μ choice)

## 3. Default switch (`src/vehicle/four-wheel.ts`)
- [ ] 3.1 Change `DEFAULT_FOUR_WHEEL_PARAMS.tireModel` from `new LinearTireModel(DEFAULT_C_ALPHA_PER_N)` to `new PacejkaTireModel(DEFAULT_PACEJKA_PARAMS)`
- [ ] 3.2 Confirm all existing R4/R5 four-wheel tests still pass (Pacejka in the linear regime is equivalent to linear, so these tests are robust to the switch)

## 4. Replay equivalence (`src/vehicle/four-wheel.test.ts`)
- [ ] 4.1 Existing replay test continues to assert `1e-8` for body state and `1e-6` for per-wheel `fz` and `slip` — re-run with the new default to confirm Pacejka determinism

## 5. App composition (`src/app/`)
- [ ] 5.1 No changes — the app uses the `FourWheelVehicle` default tire model; the swap happens transparently

## 6. End-to-end smoke
- [ ] 6.1 Existing FPS > 30 test continues to pass
- [ ] 6.2 Existing "vehicle moves > 0.5 m on W hold" test continues to pass against the new tire law

## 7. Eval artifacts (per `MEASUREMENT.md`)
- [ ] 7.1 Confirm baseline is `r5-complete`; resulting commit becomes `r6-complete`
- [ ] 7.2 Record `evals/R6/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}` including a `tokens` block

## 8. Verification
- [ ] 8.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 8.2 No new runtime dependencies; all versions still exact-pinned
- [ ] 8.3 R0–R5 tests all still pass without modification
