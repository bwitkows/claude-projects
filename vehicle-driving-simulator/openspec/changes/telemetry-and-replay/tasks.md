# Tasks — telemetry-and-replay

## 1. Format definition (`src/replay/format.ts`)
- [ ] 1.1 Define `RunRecording` interface per `design.md` (version, rung, lockfile sha256, deps, initial, events, checkpoints, final)
- [ ] 1.2 Define `RECORDING_VERSION = 1` constant
- [ ] 1.3 Define `Checkpoint` and `CheckpointWheels` interfaces

## 2. Recorder (`src/telemetry/recorder.ts`)
- [ ] 2.1 `Recorder` class with `start()`, `stop()`, `isRunning()` methods
- [ ] 2.2 `recorder.observe(step: SimStep, input: ControlState, vehicleState: FourWheelVehicleState)` called from app's onStep when running
- [ ] 2.3 Event debouncing — only record `(t, ControlState)` when state differs from previous emitted event
- [ ] 2.4 Checkpoint emission every `checkpointInterval` sim steps (default 60)
- [ ] 2.5 `recorder.serialize(): string` produces JSON via `serializeRecording()`
- [ ] 2.6 Re-export from `src/telemetry/index.ts`

## 3. Serialization (`src/telemetry/serialize.ts`)
- [ ] 3.1 `serializeRecording(recorder): string` returns JSON suitable for download
- [ ] 3.2 Deterministic field ordering for human-readability (initial, events, checkpoints, final)
- [ ] 3.3 Unit tests: round-trip a recording through `JSON.parse` + verify equivalence

## 4. Player (`src/replay/player.ts`)
- [ ] 4.1 `replayRun(recording, vehicleFactory, opts?): ReplayResult` per `design.md` signature
- [ ] 4.2 Builds a `SyntheticInputSource` from `recording.events`
- [ ] 4.3 Constructs a fresh vehicle via the factory; steps through the simulation step-by-step
- [ ] 4.4 At each step, if `step` matches a recorded checkpoint, computes `maxBodyDiff` and `maxWheelDiff` (max abs delta over numeric fields)
- [ ] 4.5 Emits `ReplayResult` with per-checkpoint pass/fail and final divergence
- [ ] 4.6 Default tolerances: body 1e-7, wheel 1e-5

## 5. Player tests (`src/replay/player.test.ts`)
- [ ] 5.1 Record → serialize → parse → replay → match: every checkpoint within tolerance
- [ ] 5.2 Replay against a vehicle whose state has been deliberately perturbed → assertion fails with bounded divergence numbers (verifies the player detects regressions)
- [ ] 5.3 Replay with custom tolerances overrides defaults

## 6. Golden fixture (`fixtures/r7-golden.json`)
- [ ] 6.1 Add a `npm run record-golden` script that drives a `FourWheelVehicle` through the scripted control sequence in `design.md` and writes `fixtures/r7-golden.json`
- [ ] 6.2 Run the script once to generate the file; commit it
- [ ] 6.3 Document in `MEASUREMENT.md` that the golden fixture is the regression baseline for `r7-complete`

## 7. Regression test (`src/replay/regression.test.ts`)
- [ ] 7.1 Loads `fixtures/r7-golden.json`
- [ ] 7.2 Constructs a fresh `FourWheelVehicle` and replays
- [ ] 7.3 Asserts every checkpoint passes within `1e-7` body / `1e-5` wheel tolerance
- [ ] 7.4 Prints the divergence numbers when failing (helpful for debugging future regressions)

## 8. Live app integration (`src/app/index.ts` + `index.html`)
- [ ] 8.1 Construct a `Recorder` in `bootstrap()` (idle by default)
- [ ] 8.2 Bind key `R` to `recorder.start()` / `recorder.stop()` toggle
- [ ] 8.3 On stop, call `recorder.serialize()` and trigger a Blob download (parallel to R0's CSV download)
- [ ] 8.4 Update the `#controls` overlay or add a small text indicator when recording is active
- [ ] 8.5 Update telemetry-overlay UI affordances minimally — a `REC ●` indicator when recording

## 9. End-to-end smoke
- [ ] 9.1 Existing FPS > 30 test still passes
- [ ] 9.2 Existing "vehicle moves > 0.5 m on W hold" test still passes
- [ ] 9.3 New e2e test: press `R`, drive briefly, press `R` again, verify a download was triggered

## 10. Eval artifacts (per `MEASUREMENT.md`)
- [ ] 10.1 Confirm baseline is `r7-complete`; resulting commit becomes `r8-complete`
- [ ] 10.2 Record `evals/R8/<tool>/<attempt-id>/{prompt.md, transcript.md, diff.patch, result.json, notes.md}` including a `tokens` block

## 11. Verification
- [ ] 11.1 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all green at HEAD
- [ ] 11.2 No new runtime dependencies; all versions still exact-pinned
- [ ] 11.3 R0–R7 tests all still pass without modification
