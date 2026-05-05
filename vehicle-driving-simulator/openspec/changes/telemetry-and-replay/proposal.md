# telemetry-and-replay

## Why

Every rung from R0 onward has asserted "replay equivalence within `1e-8`": run the same input sequence twice through the same vehicle implementation, get byte-identical state. The `SyntheticInputSource` from R0 makes this testable inside a single test harness.

R8 turns that property into **infrastructure for the eval framework**:

- A **recorder** captures the running app's input stream and key state checkpoints to a JSON file.
- A **player** replays the recorded run against a vehicle implementation (the same one or a different rung's) and asserts checkpoint state matches.
- A **golden fixture** — a recording made from the current `r7-complete` build — gets shipped in `fixtures/`. A regression test in the suite replays it on every CI run and fails if R7's vehicle dynamics drift.

This unlocks the eval framework's core proposition: a recorded ground-truth trajectory can be replayed against ANY tool's R7 implementation, and the divergence quantified at any checkpoint. Cross-tool comparisons become measurable rather than qualitative.

R8 doesn't change vehicle dynamics. It's pure infrastructure: a new `replay` capability, a JSON file format, a recorder, a player, and one bundled golden fixture.

## What Changes

- New `replay` capability:
  - `Recorder` class that subscribes to the running app's input stream and accumulates `(t, ControlState)` events, plus state checkpoints at a configurable interval (default every 60 sim steps = 0.25 s).
  - `replayRun(recording, vehicleFactory, opts?)` function that takes a recording, drives a fresh vehicle through the recorded events via `SyntheticInputSource`, and returns a `ReplayResult` with per-checkpoint divergence metrics.
  - File format `RunRecording` (TypeScript interface + JSON schema): version, rung tag, lockfile sha256, dep versions, initial state, events, checkpoints, expected final state.
- `src/telemetry/` gains a `recordRun(opts) → Recorder` factory and a `serializeRecording(recorder) → string` JSON exporter (parallel to the existing CSV exporter).
- Bundle a golden fixture `fixtures/r7-golden.json` — a 5-second deterministic run of `FourWheelVehicle` (R7 default) from `(x=0, z=0)` through a scripted control sequence (accel → steer right → brake) recorded to the file.
- Add a Vitest regression test `src/replay/regression.test.ts` that loads the golden fixture, calls `replayRun(...)` against the current `FourWheelVehicle`, and asserts every checkpoint matches within `1e-7` (slightly relaxed from `1e-8` to account for cross-build numerical noise).
- Add a Playwright e2e test that exercises the recorder against a live `bootstrap()` instance and asserts the produced JSON is valid against the format schema.
- The running app gains a key binding (default `R`) that toggles recording on/off and downloads the JSON when stopped — parallel to the `T` key for CSV download from R0's telemetry.

## Impact

- Affected specs:
  - **NEW** `replay`
  - **MODIFIED** `telemetry` (factory function for recorder; JSON exporter; new key binding)
- Affected code: `src/replay/` (new), `src/telemetry/recorder.ts` (new), `src/telemetry/serialize.ts` (new), `src/telemetry/index.ts` (re-exports), `src/app/index.ts` (wire the recorder + R key), `src/main.ts` (no change), `tests/e2e/smoke.spec.ts` (new recorder-roundtrip test), `fixtures/r7-golden.json` (new).
- BREAKING: none — this is additive infrastructure. Existing CSV export, the `T` key binding, and all R0–R7 tests are unchanged.
- Lockfile: unchanged. R8 introduces no new runtime dependencies.

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone from `r7-complete`.
2. `npm run typecheck` exits 0.
3. `npm run lint` exits 0.
4. `npm test` exits 0; the suite includes:
   - all R0–R7 tests still passing unchanged;
   - `Recorder` tests asserting events are captured only when control state changes (debounced), checkpoints emit at the configured interval, and `serializeRecording(recorder)` produces JSON that round-trips through `JSON.parse` to an equivalent recording;
   - `replayRun` tests asserting that running a freshly-constructed vehicle through a recording's events reproduces every checkpoint within `1e-7` body state and `1e-5` per-wheel `fz / slip / compression`;
   - the golden-fixture regression test in `src/replay/regression.test.ts` replays `fixtures/r7-golden.json` and passes within those tolerances.
5. `npm run build` produces a single HTML entry that loads the JS bundle.
6. `npm run e2e` passes; both existing tests still hold and a new third test asserts that pressing `R` in the live app starts and stops a recording.
7. `evals/R8/<tool>/<attempt-id>/result.json` is recorded per `MEASUREMENT.md`, including a `tokens` block.
8. All dependency versions in `package.json` remain exact-pinned. R8 SHALL NOT add new runtime dependencies.

A run is **partially passed** if (1)–(6) hold but (7)–(8) do not.
