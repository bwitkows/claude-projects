# Tasks — four-wheel-raycast

## 1. Physics: terrain collider (`src/physics/`)
- [ ] 1.1 Add a `addTerrainCollider(world, heightmap)` function that builds a Rapier trimesh collider from the same vertex positions / indices as `buildTerrainGeometry` produces; attaches it to a fixed body at the world origin
- [ ] 1.2 Vitest: terrain collider has the expected number of triangles (`segments² · 2`) and the world contains it after the call
- [ ] 1.3 Vitest: `world.castRayAndGetNormal` from a high point downward returns a hit at the expected height (matches `heightmap.heightAt` within 1e-2 tolerance — trimesh interpolates linearly while the procedural function is smooth, hence the relaxed bound)

## 2. FourWheelVehicle (`src/vehicle/four-wheel.ts`)
- [ ] 2.1 Define `WheelState` and `FourWheelVehicleState extends BicycleVehicleState` in `src/vehicle/types.ts`
- [ ] 2.2 Define `FourWheelVehicleParams` with mass, inertia, axle distances, track width, CoG height, wheel radius, drive/brake/drag (matching R2 where applicable), `Cα`, `δ_max`, `vMax`, `vMinSlip`
- [ ] 2.3 Implement `FourWheelVehicle` with constructor signature `{ world, terrain, params }, initial?`. Builds a Rapier dynamic rigid body locked to yaw-only, attaches a cuboid collider matching the visible vehicle box
- [ ] 2.4 Implement `step(dt, control)` that: per-wheel raycast, computes per-wheel `F_z` via quasi-static load transfer (using *this step's* expected `a_x, a_y` so it isn't lagged), applies drive / brake at wheel contact points and lateral force at axle midpoints; does NOT call `world.step`
- [ ] 2.5 Implement `state` getter that reads back from the Rapier body (translation, rotation, linvel, angvel) plus the most recent per-wheel raycast results
- [ ] 2.6 Implement `reset(partial?)` that resets the body translation, heading, and zero velocities deterministically
- [ ] 2.7 Re-export from `src/vehicle/index.ts`

## 3. FourWheelVehicle tests (`src/vehicle/four-wheel.test.ts`)
- [ ] 3.1 At rest on level terrain (`x=0, z=0`), all four wheels report contact and `Σ fz = m·g` within 0.5 N
- [ ] 3.2 At rest, individual `fz` values: `fz_fl = fz_fr = m·g·b/(2L)`; `fz_rl = fz_rr = m·g·a/(2L)` within 0.5 N
- [ ] 3.3 Under sustained throttle for 1 simulated second, `fz_rl + fz_rr > fz_fl + fz_fr` (rearward weight transfer)
- [ ] 3.4 Under braking from speed for 1 simulated second, `fz_fl + fz_fr > fz_rl + fz_rr` (forward weight transfer)
- [ ] 3.5 Under right turn at speed (`steer = 1`) for 1 simulated second, `fz_fl + fz_rl > fz_fr + fz_rr` (lateral weight transfer to outside / left side at right turn — sign convention: `steer = +1` is right turn → CCW yaw is *negative* would be wrong. Verify the sign in the test against the R1 convention: `steer = +1` produces positive yaw rate which is CCW, which is *left* turn from above → outside is *right*, so `fz_right > fz_left`. Adjust assertion if needed at impl time)
- [ ] 3.6 Replay equivalence: two FourWheelVehicle instances with identical Rapier worlds and identical input sequences match step-for-step within `1e-8` over 240 sim steps
- [ ] 3.7 No-NaN: under arbitrary input sequences from rest, no field of `state` is NaN/Infinity at any step
- [ ] 3.8 R1 KinematicVehicle and R2 BicycleVehicle tests still pass unchanged

## 4. App composition (`src/app/`)
- [ ] 4.1 Switch the default constructor from `BicycleVehicle` to `FourWheelVehicle`. Pass the world, terrain (heightmap), and reasonable defaults
- [ ] 4.2 Telemetry record per step adds `fz_fl, fz_fr, fz_rl, fz_rr` (read from `state.wheels.*.fz`)
- [ ] 4.3 Verify CSV header (when buffer non-empty) is `t,step,fz_fl,fz_fr,fz_rl,fz_rr,heading,slip_f,slip_r,speed,vx,vy,x,yaw_rate,z`
- [ ] 4.4 Add the terrain collider during bootstrap (after physics world creation, before vehicle creation)
- [ ] 4.5 `AppHandle.vehicle` typed as `VehicleModel` per the R2 rule

## 5. Render
- [ ] 5.1 No render changes required. The vehicle box continues to read `{x, y, z, heading}` from `state` and the chase camera continues to follow it. The vehicle's `y` now comes from the Rapier body, not from `heightmap.heightAt + RIDE_HEIGHT` — but the app's per-render bookkeeping stays the same shape (it just reads from `state.y` if available, or computes from terrain otherwise)

## 6. End-to-end smoke
- [ ] 6.1 Existing FPS > 30 test continues to pass
- [ ] 6.2 Existing "vehicle moves > 0.5 m on W hold" test continues to pass against the new default

## 7. Eval artifacts (per `MEASUREMENT.md`)
- [ ] 7.1 Confirm baseline is `r3-complete`; the resulting commit becomes `r4-complete` after archive
- [ ] 7.2 Record `evals/R4/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}` including a `tokens` block

## 8. Verification
- [ ] 8.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 8.2 No new runtime dependencies; all versions still exact-pinned
- [ ] 8.3 Bicycle replay-equivalence test still passes within 1e-8 (regression: R4 didn't perturb R2 dynamics)
