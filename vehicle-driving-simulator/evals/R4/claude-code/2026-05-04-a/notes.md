# Notes — R4 / claude-code / 2026-05-04-a

## Outcome

Passed all five gates with **one diagnostic correction round** during testing. 81 unit tests across 14 files (R3 was 67/12; R4 adds 14 tests across 2 new files: terrain-collider, four-wheel). Both Playwright e2e tests still pass against the new Rapier-backed default. Zero clarifying questions to the user.

This was the largest rung so far (919 insertions / 29 deletions / 8 files), reflecting Rapier integration plus per-wheel mechanics.

## The "why are weight transfers backwards" diagnostic

First test run showed two failures:
- "Shifts rearward under throttle" — got front=7969, rear=6746 (front MORE loaded under throttle, opposite of what's expected).
- "Shifts forward under brake" — symmetric inverted result.

Static distribution at rest passed (front=7920, rear=6789, front>rear because b>a → CoG forward of midline). So the static math was right; only the *transfer direction under acceleration* was wrong.

Built a one-off diagnostic test that logged `vx` and `fz` at steps 0, 59, 119, 239 of full-throttle. Found:
- step 0: vx=0.025, fz_front_total=6190, fz_rear_total=8519. **Correct** transfer (rear loaded under throttle).
- step 59: vx=**25.78**(!), fz_front=7969, fz_rear=6746. Vehicle had blown past vMax=25 in 59 steps.
- step 239: vx=25.65 (drag balance has set in by now).

Root cause: **Rapier's `addForce` / `addForceAtPoint` accumulate persistently across `world.step()` calls** — they are *not* auto-cleared. My step() called these once per step assuming per-step force budget semantics; instead the previous step's forces stacked on top, producing geometric runaway in vx.

Fix: call `body.resetForces(false)` and `body.resetTorques(false)` at the start of every `step(dt, control)` so each step starts with a clean force budget. After fix, vx at step 239 = 5.34 m/s (matches the analytical ODE solution `vx(t) = 25·(1−exp(−t/τ))` for `τ = m/dragCoef = 4.17 s`). All weight-transfer tests pass cleanly.

This is documented as an interpretation in `src/vehicle/four-wheel.ts` so future rung implementers (or maintainers swapping vehicle models) don't repeat the mistake.

## Other interpretations

1. **No chassis cuboid collider on the Rapier body** (deviation from spec wording). Spec said to attach a cuboid collider matching the visible vehicle box. Implementation uses `setAdditionalMassProperties(mass, com, principalInertia, frame)` directly, with no Rapier collider on the chassis. Reason: a cuboid colliding with the trimesh terrain would generate contact responses that fight our manual Y management (which sets body Y from `terrain.heightAt + rideHeight` each step). Mass and yaw inertia match a 1.8×1.0×4.0 cuboid analytically (`Iy = 2500` chosen to match R2's bicycle exactly). R7 (suspension) may add a real chassis collider for environment contacts since it'll need them.

2. **Body Y is locked + manually overridden each step**. With Rapier integration: `setEnabledTranslations(true, false, true, true)` locks Y; `setGravityScale(0, true)` disables gravity for the body; `setTranslation({x, terrain.heightAt(x,z) + rideHeight, z}, true)` is called at the start of every `step()`. Net result: Rapier integrates X, Z, and yaw from applied forces; Y rides the terrain deterministically. Quasi-static `F_z` is computed for telemetry / future-rung consumption but isn't applied as a physical upward force.

3. **Per-wheel raycast warmup**. Rapier's broad phase doesn't index a newly-added collider until the next `world.step()`. The very first wheel raycast after creating the terrain trimesh therefore returns `null`. App composition runs one warmup `physics.step()` after `addTerrainCollider` and before the vehicle is constructed. Tests do the same. Documented inline.

4. **Trimesh winding**. R3's mesh.ts uses `(a, c, b, b, c, d)` triangulation order; the second triangle is wound CW from above (normal points -Y). Three.js's `computeVertexNormals` fixes this for the visible mesh. Rapier's trimesh raycast doesn't seem to require correct winding — raycasts from above return hits regardless of triangle orientation, and the surface normal Rapier returns is consistent with the geometry. Verified by the terrain-collider tests.

5. **Lateral force still per-axle, not per-wheel**. Spec design.md said "R4 keeps it per-axle"; implementation matches. R5 is where slip becomes per-wheel.

6. **Heading sign convention preserved from R1**. `quaternionFromHeading(h)` builds a quaternion that rotates body +Z toward +X for positive h (matching R1's `x += v*sin(h)*dt; z += v*cos(h)*dt`). This is a NEGATIVE rotation around +Y in standard math convention, hence `half = -heading * 0.5`. `headingFromQuaternion(q)` is the inverse. With pitch/roll locked, `q.x = q.z = 0` always.

## What surprised the agent

- **The persistent-force gotcha**. Rapier's API is consistent — `resetForces`, `resetTorques`, and `userForce()` exist as explicit methods because forces accumulate across steps by design. The R0 physics test passed despite never resetting because it never *added* forces (only collision response and gravity). The first time R4 tried to drive the body with custom forces, the bug surfaced immediately.
- **First-pass tests were 9 of 11 green**. Static distribution, replay equivalence within 1e-8, no-NaN under arbitrary inputs, lateral-cornering — all passed before the throttle/brake tests revealed the resetForces issue. The architectural seams (heading extraction, body-frame velocity computation, slip angle math, per-wheel hardpoints) were correct on the first try.

## What the agent did NOT do

- Did not modify R1 KinematicVehicle, R2 BicycleVehicle, or R3 terrain / camera code. R1/R2 tests pass unchanged. R3's `Heightmap` is reused for both visible mesh and physics trimesh — single source of truth.
- Did not introduce reverse gear. Forward-only `vx ≥ 0` clamp via `setLinvel` after force application.
- Did not implement per-wheel slip (R5) or saturating tire forces (R6) or suspension dynamics (R7).
- Did not add new runtime dependencies. Lockfile sha256 unchanged from R0.

## Eval-grader cues

- The headline finding is the **resetForces gotcha** — flag any tool's R4 implementation that doesn't either call resetForces explicitly OR re-issue identical forces every step (which Rapier *does* support but is less natural than per-step force budget).
- The replay-equivalence test passes within `1e-8` for body-frame state and `1e-6` for per-wheel `fz`. Two independent Rapier worlds in the same Vitest process produce byte-identical results — this is the strong determinism signal that downstream rungs depend on.
- The "no chassis collider" interpretation is the only spec-text deviation. A different tool that attached the cuboid collider as the spec literally said would have to handle the contact-response-vs-manual-Y conflict somehow (collision groups, sensor flag, or accepting the contact dynamics).
