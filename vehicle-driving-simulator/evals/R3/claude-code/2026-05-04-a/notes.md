# Notes — R3 / claude-code / 2026-05-04-a

## Outcome

Passed all five gates on the first run with **zero self-corrections** and **zero clarifying questions**. 67 unit tests across 12 files (R2 was 49/9; R3 adds 18 tests across 4 new files: terrain heightmap, terrain mesh, render camera). Both Playwright e2e tests pass against the new visuals — vehicle on terrain, chase camera following.

This is the cleanest run of the rung ladder so far. The spec was specific (analytic heightmap, body-frame camera offsets, no physics changes), the architecture was already there from R0–R2 (renderer is a pure consumer of state, sim core untouched), and the work decomposed cleanly into three independent modules.

## Interpretations the agent made

1. **Spec's `cross([1, ∂h/∂x, 0], [0, ∂h/∂z, 1])` is wrong-handed.** The design.md said the upward normal comes from `cross(T_x, T_z)` where T_x and T_z are the partial-derivative tangent vectors. Working that out gives `(∂h/∂x, -1, ∂h/∂z)` — pointing **-Y**, not +Y. The implementation uses `cross(T_z, T_x)` instead, which gives `(-∂h/∂x, +1, -∂h/∂z)` — the +Y-pointing normal the spec actually requires. Documented in `src/terrain/heightmap.ts`. The `normalAt agrees with heightAt's analytic derivative` test passes because both the spec scenario's "closed-form normal" and the implementation derive from the same partial derivatives — only the sign convention had to be fixed.

2. **`heightAt` evaluates the analytic function, not the rendered mesh.** Bilinear interpolation of the rendered mesh would give *slightly* different y values between vertex points (~1 cm worst case at default frequencies). The spec's design.md explicitly deferred this choice to R4; R3 picks "analytic function everywhere" so vehicle visual placement and any future raycast against `heightAt` agree exactly. Documented in design.md, no code interpretation needed.

3. **Render-frame `dt` tracked locally in app, not piped through `FixedStepLoop`.** The chase camera needs wall-clock dt to advance its exponential decay; the existing `onRender(alpha)` callback only carries sim alpha. Adding a `dt` parameter to `onRender` would have been a small refactor of the sim loop API used by the kinematic and bicycle vehicles' tests. Instead, the app composition tracks `lastRenderMs` itself, which keeps the sim loop API unchanged and contains R3's render-time concerns to the composition root. Documented inline in `src/app/index.ts`.

4. **`scene.snapCamera` exposed alongside `updateCamera`.** The spec didn't mandate a "snap" path, but without it the very first rendered frame after bootstrap shows the camera at its default position (origin-ish) for a few hundred ms before lerping to its proper place. Adding `snapCamera({vehiclePos, vehicleHeading})` to set the steady-state pose at bootstrap fixes the initial frame without affecting steady-state behavior. Tested in `camera.test.ts`.

5. **Terrain mesh size 200 m × 200 m, 128 segments.** Inherited the design.md defaults. With the chase camera offset at 8 m behind and a typical viewing distance of 100 m, the visible terrain is well within the 200 m square. If the vehicle drives more than 100 m from the origin the terrain mesh ends — visible only in extended driving sessions, acceptable for R3.

## What surprised the agent / friction points

- **First-pass green on all 5 gates.** Only R3 has had this. R2 needed two correction rounds; R1 needed one. R0 needed one (lint autofix). The reason is partly that the spec was tightly aligned with what was buildable, and partly that R3's *seams* (heightmap as pure data, camera as pure helper, scene as a thin THREE consumer) made the testable surface trivially testable.
- **Bundle grew by ~3 kB** (2752 → 2755 KB). Heightmap + camera helpers are tiny; the BufferGeometry generator adds a small amount but no new dependencies.
- **The `vehicle-y from terrain` is invisible to the rest of the system.** Telemetry doesn't change; replay determinism doesn't change; the bicycle model's R2 tests pass byte-for-byte. The architecture decision in R0/R1 to keep render and physics fully decoupled was the load-bearing choice that made R3 small.

## What the agent did NOT do

- Did not modify `BicycleVehicle` or `KinematicVehicle` — vehicle dynamics are unchanged.
- Did not add a skybox, textures, or PBR materials. R3 is geometry, not art.
- Did not add camera collision (will pass through hills on steep descents) — flagged in design.md as acceptable for R3.
- Did not add new runtime dependencies. Lockfile sha256 unchanged from R0.
- Did not touch `tests/e2e/smoke.spec.ts`. Both existing e2e tests pass against the new scene without modification.

## Eval-grader cues

- The architectural seam between physics and rendering (established in R0, exercised in R1/R2/R3) is the key thing that made R3 small. A different tool that lacked R0/R1/R2's discipline (e.g. coupled vehicle position into the renderer's transform graph) would have a much larger R3.
- The chase camera tests cover the body-frame-preservation property (after a heading change and convergence, the camera-vehicle vector de-rotated by the new heading equals the configured offset within 1e-6). That's the spec's hardest scenario and a useful test for any future tool.
- The `normalAt` and `partialX/Z` test pair (analytic vs. central-difference) is a standard pattern for verifying analytic derivatives without circular reasoning. R5 (linear-tire) and R6 (Pacejka) will likely benefit from a similar pattern when checking force calculations.
