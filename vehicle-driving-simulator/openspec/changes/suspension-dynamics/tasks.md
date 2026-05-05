# Tasks — suspension-dynamics

## 1. WheelState additions (`src/vehicle/types.ts`)
- [ ] 1.1 Add `readonly compression: number` to `WheelState`
- [ ] 1.2 Update `NEUTRAL_WHEEL_STATE` to include `compression: 0`

## 2. FourWheelVehicleParams additions (`src/vehicle/four-wheel.ts`)
- [ ] 2.1 Add `springRestLength: number` (default 0.4)
- [ ] 2.2 Add `springStiffness: number` (default 70_000 N/m per wheel)
- [ ] 2.3 Add `springDamping: number` (default 5_000 N·s/m per wheel)
- [ ] 2.4 Add `wheelRadius: number` (default 0.35) — was implicit in `wheelMaxRayLen` before; making it explicit lets the equilibrium-pose calculation use it

## 3. FourWheelVehicle constructor changes
- [ ] 3.1 Switch `setEnabledTranslations` to `(true, true, true, true)` — unlock Y
- [ ] 3.2 Switch `setEnabledRotations` to `(true, true, true, true)` — unlock pitch and roll
- [ ] 3.3 Switch `setGravityScale(0, true)` to `setGravityScale(1, true)` — re-enable gravity
- [ ] 3.4 Compute initial body Y at suspension equilibrium: `y_eq = terrain.heightAt(x, z) + R_wheel + L_0 − x_rest + chassis_half_height` where `x_rest = m·g / (4·k)`
- [ ] 3.5 Initialize `prevCompression: { fl: 0, fr: 0, rl: 0, rr: 0 }` on the vehicle for the damper's backward-difference

## 4. FourWheelVehicle.step changes
- [ ] 4.1 Remove the `setTranslation({x, terrain.heightAt + rideHeight, z})` Y override; let Rapier integrate Y under gravity + spring forces
- [ ] 4.2 Per wheel, after raycast, compute `compression = max(0, springRestLength − raycast_distance)` and `dx_dt = (compression − prevCompression) / dt`
- [ ] 4.3 Per wheel, compute `F_spring = max(0, k·compression + c·dx_dt)` and apply at the wheel's contact point in world `+Y`
- [ ] 4.4 Set `wheelStates.<id>.fz = F_spring` (replaces the quasi-static formula). Set `wheelStates.<id>.compression = compression`
- [ ] 4.5 Drop the entire quasi-static load-transfer block (`dFzLong`, `dFzLat`, `fzStaticFront/Rear`, etc.) — `F_z` now comes from the spring
- [ ] 4.6 Update `prevCompression` at the end of each step
- [ ] 4.7 Slip-angle calculation, lateral force application, drive / brake / drag application all unchanged from R5/R6 — they consume `F_z` (now `F_spring`) without caring about its origin

## 5. App composition (`src/app/index.ts`)
- [ ] 5.1 Telemetry record per step gains `c_fl, c_fr, c_rl, c_rr` from `state.wheels.<id>.compression`
- [ ] 5.2 Verify CSV header (when buffer non-empty) includes the four new columns in alphabetical position
- [ ] 5.3 No render changes — the visible chassis box now sits at body's translation, which is ~70 cm higher than R6 due to suspension. Acceptable; chassis pitches and rolls visibly under driving inputs

## 6. Tests (`src/vehicle/four-wheel.test.ts`)
- [ ] 6.1 At rest after settling (240 sim steps), `Σ fz` equals `m·g` within 1 N
- [ ] 6.2 At rest after settling, individual `fz` values approximately equal R4 quasi-static values within 5 N (springs at static equilibrium produce same loads as the formula did)
- [ ] 6.3 Under sustained throttle for 1 s, `state.wheels.rl.compression + state.wheels.rr.compression > state.wheels.fl.compression + state.wheels.fr.compression` (rear squat)
- [ ] 6.4 Under braking from speed for 0.5 s, `fl + fr > rl + rr` for compression (front dive)
- [ ] 6.5 Under cornering at speed (`steer = 1`), the outside (left in our right-turn convention) compression > inside compression
- [ ] 6.6 Pitch under throttle: `Math.abs(pitch_angle) > 0.005 rad` after 1 s of full throttle (rear-down — sign depends on body convention)
- [ ] 6.7 Roll under cornering: `Math.abs(roll_angle) > 0.005 rad` after 1 s of cornering
- [ ] 6.8 Replay equivalence within `1e-8` for body state and `1e-6` for per-wheel `fz, slip, compression` over 240 sim steps
- [ ] 6.9 R4–R6 tests continue to pass — they assert relative orderings (`fz_rear > fz_front` under throttle, etc.) which hold against R7 dynamics

## 7. Eval artifacts (per `MEASUREMENT.md`)
- [ ] 7.1 Confirm baseline is `r6-complete`; resulting commit becomes `r7-complete`
- [ ] 7.2 Record `evals/R7/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}` including a `tokens` block

## 8. Verification
- [ ] 8.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 8.2 No new runtime dependencies; all versions still exact-pinned
- [ ] 8.3 R0–R6 tests all still pass without modification
