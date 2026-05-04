# terrain-and-camera

## Why

R0–R2 ran on a flat plane with a fixed top-down-ish camera. The vehicle dynamics evolved (kinematic → bicycle), but the visual frame of reference didn't — you couldn't tell the vehicle was moving without watching the FPS counter or reading telemetry.

R3 is the **visual maturity** rung. It introduces:

- a **heightmap-defined world** — undulating ground with hills, valleys, and a real horizon — so the vehicle has spatial context;
- a **chase camera** that follows the vehicle from behind at a fixed body-frame offset, smoothly catching up — so a human watching the page can actually drive.

Vehicle dynamics are deliberately *unchanged* in R3 — physics still runs in the XZ plane. The heightmap only affects what's rendered: the terrain mesh, and the vehicle's render-time `y` coordinate. R4 (four-wheel raycast) is where terrain becomes a physical surface that the vehicle interacts with via Rapier raycasts.

R3 also stages infrastructure R4 needs: a deterministic `terrain.heightAt(x, z)` sampler that R4 will query for per-wheel ground contact, and a `terrain.normalAt(x, z)` accessor for surface alignment. R3 ships both even though only `heightAt` is used visually, so R4 doesn't have to extend the terrain API.

## What Changes

- New `terrain` capability with a deterministic procedural heightmap (sum of sines, no random noise — replay-stable across runs and platforms), bilinear `heightAt(x, z)` sampler, and a closed-form `normalAt(x, z)` derivative.
- Generate a Three.js mesh from the heightmap and replace R0's flat ground plane in the scene.
- Replace the static camera with a chase camera that follows the vehicle at a fixed body-frame offset (default: 8 m behind, 4 m above the rear axle), looking at a point slightly ahead of the vehicle. Position smoothly converges via exponential lerp.
- Each render frame, set the vehicle mesh's world `y` to `terrain.heightAt(state.x, state.z) + RIDE_HEIGHT`. Vehicle pose in dynamics remains 2D (`x, z, heading`) — `y` is purely a render concern.
- Vitest coverage for: terrain heightAt determinism, bilinear sampler accuracy at known points, normalAt closed-form correctness, chase-camera one-step convergence behavior, and the existing replay equivalence still passing for the bicycle vehicle.
- Playwright smoke continues to pass: page boots, FPS > 30, vehicle moves > 0.5 m on `w` hold.

## Impact

- Affected specs:
  - **NEW** `terrain`
  - **MODIFIED** `rendering` (chase camera replaces static; terrain mesh replaces flat plane; vehicle y from terrain)
- Affected code: `src/terrain/` (new), `src/render/camera.ts` (new), `src/render/scene.ts` (modified — terrain mesh, chase camera integration), `src/app/index.ts` (terrain wiring, vehicle-y per render), `index.html` (no change), `tests/e2e/smoke.spec.ts` (no assertion change required — both tests still hold against the new visuals).
- BREAKING: none for tests or telemetry (no schema change). Visual: anyone pixel-comparing the canvas against R0–R2 builds will see entirely different output; no existing assertion relies on that.
- Vehicle dynamics: unchanged — `BicycleVehicle` and `KinematicVehicle` are byte-for-byte identical to R2. The replay-equivalence determinism test for the bicycle vehicle continues to hold within `1e-8`.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from `r2-complete`.
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - all R0/R1/R2 tests still passing unchanged;
   - terrain tests asserting `heightAt(x, z)` is pure (two calls return identical values), bilinear interpolation matches a closed-form expectation at non-grid points, and `normalAt(x, z)` is a unit vector;
   - chase-camera tests asserting one-step convergence toward the desired position is monotonic, and that at steady state the camera's body-frame offset matches the configured offset within `1e-6`.
5. `npm run build` produces a single HTML entry that loads the JS bundle.
6. `npm run e2e` passes; the existing two tests still pass against the new visuals.
7. `evals/R3/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`, including a `tokens` block.
8. All dependency versions in `package.json` remain exact-pinned. R3 SHALL NOT add new runtime dependencies.

A run is **partially passed** if (1)–(6) hold but (7)–(8) do not.
