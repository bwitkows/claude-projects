# Tasks — terrain-and-camera

## 1. Terrain capability (`src/terrain/`)
- [ ] 1.1 Implement `Heightmap` class with procedural sum-of-sines `heightAt(x, z)` per `design.md`
- [ ] 1.2 Implement closed-form `normalAt(x, z)` returning a unit vector pointing roughly +Y
- [ ] 1.3 Expose `DEFAULT_HEIGHTMAP_PARAMS` (amplitudes, wavelengths, phase offsets) so future rungs can tune
- [ ] 1.4 Implement `buildTerrainGeometry(heightmap, opts)` returning a `BufferGeometry` for a 200×200 m, 128×128-vertex mesh centered on the origin
- [ ] 1.5 Vitest: `heightAt` is a pure function (two calls return identical values for the same input)
- [ ] 1.6 Vitest: `heightAt(0, 0)` and `heightAt(L_LARGE * π / 2, 0)` and similar non-grid points match a closed-form expectation within 1e-12
- [ ] 1.7 Vitest: `normalAt(x, z)` returns a unit vector (magnitude 1 within 1e-12) at multiple sample points
- [ ] 1.8 Vitest: `buildTerrainGeometry` produces the expected vertex count (`segments² * 2 * 3` index entries for triangulation; `(segments+1)²` positions) and no NaN positions

## 2. Chase camera (`src/render/camera.ts`)
- [ ] 2.1 Implement a pure helper `ChaseCameraState` with `step({ vehiclePos, vehicleHeading, dt })` returning `{ position, lookAt }` after one frame of exponential decay
- [ ] 2.2 Expose `DEFAULT_CHASE_OFFSET` and `DEFAULT_CHASE_LOOKAT` plus `CAMERA_DECAY` constants
- [ ] 2.3 Vitest: from a far-from-target initial state, one step advances toward the desired position monotonically
- [ ] 2.4 Vitest: at steady state (running for many seconds with vehicle stationary), the camera body-frame offset matches `DEFAULT_CHASE_OFFSET` within 1e-6
- [ ] 2.5 Vitest: at steady state with vehicle at heading=0, world-frame camera position equals `vehicle + DEFAULT_CHASE_OFFSET` exactly within 1e-6

## 3. Scene integration (`src/render/scene.ts`)
- [ ] 3.1 Replace the flat `PlaneGeometry` ground with `buildTerrainGeometry(heightmap)` output
- [ ] 3.2 `createScene` accepts a `Heightmap` (or constructs the default if none supplied) and stores a `ChaseCameraState`
- [ ] 3.3 `updateVehicle({ x, y, z, heading })` accepts the world-frame `y` from the app; existing callers pass the new field
- [ ] 3.4 Add an `updateCamera({ vehiclePos, vehicleHeading, dt })` method that advances the chase camera and applies the result to the Three.js camera
- [ ] 3.5 The Three.js scene's directional light orientation and ambient light are unchanged
- [ ] 3.6 Disposal frees the new geometry / materials cleanly

## 4. App composition (`src/app/`)
- [ ] 4.1 Construct a `Heightmap` in `bootstrap()`
- [ ] 4.2 Per render frame: compute `vehicleY = heightmap.heightAt(state.x, state.z) + RIDE_HEIGHT`; pass `{x, y: vehicleY, z, heading}` to `scene.updateVehicle`
- [ ] 4.3 Per render frame: pass `{ vehiclePos: {x, vehicleY, z}, vehicleHeading: state.heading, dt: lastRenderDt }` to `scene.updateCamera`
- [ ] 4.4 Track `lastRenderDt` as wall-clock delta between rAF callbacks (already implicitly available — pipe it through)

## 5. End-to-end smoke
- [ ] 5.1 Existing FPS > 30 test continues to pass against the new visuals
- [ ] 5.2 Existing "vehicle moves > 0.5 m on W hold" test continues to pass (vehicle dynamics unchanged)
- [ ] 5.3 No new e2e test required by R3

## 6. Eval artifacts (per `MEASUREMENT.md`)
- [ ] 6.1 Confirm baseline is `r2-complete`; the resulting commit becomes `r3-complete` after archive
- [ ] 6.2 Record `evals/R3/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}` including a `tokens` block

## 7. Verification
- [ ] 7.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 7.2 No new runtime dependencies in `package.json`; all versions still exact-pinned
- [ ] 7.3 Replay-equivalence test for `BicycleVehicle` still passes within 1e-8 (regression check that R3 didn't perturb dynamics)
