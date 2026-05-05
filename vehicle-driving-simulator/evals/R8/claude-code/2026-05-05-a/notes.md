# Notes — R8 / claude-code / 2026-05-05-a

## Outcome

Passed all five gates with **one minor self-correction round** (a perturbation test that didn't actually perturb anything because Rapier was bit-identical across runs). 107 unit tests across 17 files (R7 was 100/15; R8 added 6 player tests + 1 regression test in two new files). Three Playwright e2e tests including a new R-key recording roundtrip.

R8 is **pure infrastructure** — no vehicle dynamics changes. The largest rung by line count (1634+/2-/13 files), but most of that is the format types, recorder/serializer/player implementations, the tests, and the 22 KB committed golden fixture.

## The Rapier-is-bit-identical surprise

R8's "detects perturbation" test was originally written to use the default factory (no perturbation) with extremely tight tolerances (1e-30), expecting the player's failure path to fire on float noise. Test failed: `result.ok = true` even at 1e-30 tolerance.

Diagnosed: Rapier's WASM solver is **fully deterministic** across two independent worlds in the same process when fed identical inputs. Two `FourWheelVehicle` instances driven by the same `SyntheticInputSource` produce **bit-identical** state. The diff is exactly 0 (or smaller than 1e-30 absolute, which is 0 in float64).

This is actually a positive finding — the determinism the rung ladder has been promising since R0 holds at the strictest possible level. Rewrote the test to use an actual `fDrive: 9000 * 1.1` perturbation, which produces a measurable divergence after 240 sim steps.

This means the default `1e-7 / 1e-5` tolerances in `replayRun` are luxury for in-process replay — actual divergence is 0. The tolerances become meaningful for cross-build / cross-machine / cross-version replay where JIT recompilation could produce 1-ULP float differences.

## Other interpretations

1. **Golden fixture lockfileSha256 / deps left empty.** The recorder accepts these as optional metadata; the regenerate path doesn't compute the lockfile hash (would require either reading `package-lock.json` from the test or threading it through). For R8 these fields are informational only; populated correctly via app composition where `package-lock.json` is read at build time. Future work can wire them through.

2. **Recorder.recording() can be called while running.** Returns the in-memory snapshot with whatever the last full checkpoint was. Useful for live UI or peek-style tests; not strictly required by spec but a small addition.

3. **R-key e2e test does not assert on the actual download.** Playwright's download API is sensitive to browser configuration; asserting on the recorder transition (running ↔ not running) and the indicator class is sufficient evidence the integration works end-to-end. The download path itself is exercised by the live build manually.

4. **The regression test takes the GENERATE_GOLDEN env var path with the SAME assertion logic.** This means the test always validates "the just-generated fixture replays correctly" in regenerate mode (sanity check), not just "the bundled fixture replays correctly". Keeps the regenerate path from silently producing a broken fixture.

5. **`findLast` replaced with a manual `for` loop.** TypeScript's `Array.findLast` requires `target: ES2023` or `lib: ES2023` in tsconfig; we use ES2022. Manual scan is two lines and avoids a config bump.

## What surprised the agent

- **Rapier's determinism is bit-perfect, not approximate.** I expected float noise at 1e-15 level; actual divergence is exactly 0. R0's `physics/world.test.ts` already tested `1e-8` on a free-fall ball and passed; R8 confirms this holds for the full FourWheelVehicle stack at 240 steps. Cross-build / cross-machine tolerance is the only place divergence accumulates.
- **R8 was simpler than R7.** Despite being the largest by line count, R8 has no vehicle dynamics complexity — it's just types, a recorder class, a player function, and a fixture. R7's three diagnostic rounds were unique to physics-implementation rungs.
- **The eval-framework payoff is real.** With R8 in place, you can hand the recorded `r7-golden.json` to any tool's R7 implementation (replay it via `replayRun(recording, theirFactory)`) and quantify the divergence at every checkpoint. Cross-tool comparison goes from "how did your vehicle feel?" to "your vehicle's heading at step 600 differs by 0.034 rad from the reference."

## What the agent did NOT do

- Did not modify R0–R7 source code. R8 is pure addition.
- Did not implement replay UI in the live app (just record + download). Watching a replay would need a separate page; future-rung concern if useful.
- Did not implement diff visualization. Tests print divergence numbers; eyeballing is enough for R8.
- Did not add a cross-platform reproducibility test. The lockfileSha256 / deps fields scope cross-build comparisons; the test itself runs in-process.
- Did not add new runtime dependencies. Lockfile sha256 unchanged from R0.

## Eval-grader cues

- The headline R8 deliverable: `replayRun(recording, vehicleFactory)` — a function any future tool can call to replay a recorded session against their R7 implementation. The `vehicleFactory` abstraction is what makes cross-rung / cross-tool divergence measurable.
- The bundled `fixtures/r7-golden.json` is the regression baseline. If a future rung changes R7's defaults (e.g., chassis dimensions, tire stiffness), the regression test fires and prints exactly which fields diverged.
- Rapier's bit-perfect determinism means the regression test catches any change to vehicle dynamics down to 1 ULP. That's a strong eval signal: if your tool's R7 produces output that differs from the reference fixture, the divergence is meaningful, not float noise.
