# Design — telemetry-and-replay

## Context

R8 is the eval-framework infrastructure rung. The vehicle dynamics work is done; R7 left the rung ladder with a physically grounded, deterministic, eight-rung vehicle implementation. R8 packages that determinism into a tool other implementations can be measured against.

Two artifacts ship in R8:

1. **A recorder** that turns a live driving session into a JSON file.
2. **A player** that replays the JSON file against any vehicle implementation and reports state divergence at recorded checkpoints.

Plus one **golden fixture**: a 5-second pre-recorded driving session against the current `FourWheelVehicle`. The CI regression test replays it; if vehicle dynamics drift in a future rung or refactor, the test fails with specific checkpoint divergence numbers.

## Goals / non-goals

Goals:
- A self-contained JSON file format that's human-readable, version-tagged, and round-trippable through standard `JSON.parse` / `JSON.stringify`.
- Recorder integrated into the running app via a key binding, parallel to R0's CSV-download key (`T`). Default `R` for "record".
- Player API is `replayRun(recording, vehicleFactory, opts?)` — the factory abstracts over which vehicle class to instantiate, so the same recording can drive `FourWheelVehicle`, `BicycleVehicle`, or any future implementation.
- Bundled golden fixture covers a control sequence that exercises throttle, brake, and steer, with checkpoints every 60 sim steps.
- Numerical tolerances calibrated to be tight enough to catch real regressions (>1e-6) but loose enough to absorb cross-build floating-point noise (1e-7 to 1e-5).

Non-goals:
- No replay UI in the app (just record + download). Watching a replay would need a separate "replay player" page; that's a future rung if useful.
- No diff visualizer for divergent replays. Tests print numerical divergence; eyeballing it is enough for R8.
- No cross-platform reproducibility test. The golden fixture is generated and verified on the same `package-lock.json`; cross-machine reproducibility is the concern of `MEASUREMENT.md`'s lockfile-hash field, not R8 directly.
- No replay against arbitrary historical commits. The fixture targets `r7-complete`; future rungs will add their own fixtures.

## Decisions

### Decision: File format

```ts
interface RunRecording {
  readonly version: 1;
  readonly rung: string;             // "R7" at time of recording
  readonly recordedAt: string;       // ISO-8601 UTC
  readonly lockfileSha256: string;   // SHA-256 of the package-lock.json at record time
  readonly deps: Record<string, string>; // pinned dep versions
  readonly initial: {
    readonly vehicle: 'FourWheelVehicle' | 'BicycleVehicle' | 'KinematicVehicle';
    readonly params?: Record<string, unknown>; // null/undefined = defaults
    readonly x: number;
    readonly z: number;
    readonly heading: number;
  };
  readonly events: readonly { readonly t: number; readonly state: ControlState }[];
  readonly checkpoints: readonly {
    readonly step: number;
    readonly time: number;
    readonly state: Record<string, number>;  // body-frame fields, no wheels
    readonly wheels: Record<'fl' | 'fr' | 'rl' | 'rr', { fz: number; slip: number; compression: number }>;
  }[];
  readonly final: {
    readonly step: number;
    readonly time: number;
    readonly state: Record<string, number>;
    readonly wheels: Record<'fl' | 'fr' | 'rl' | 'rr', { fz: number; slip: number; compression: number }>;
  };
}
```

JSON form preserves field ordering for human readability but the player relies only on field presence, not order.

### Decision: Recorder semantics

`Recorder` subscribes to the app's input stream (via the existing `KeyboardInputSource`) and the vehicle state. Two streams emitted:

- **Events**: a control event is emitted only when the abstract `ControlState` actually changes (debounced — repeated identical states across steps are collapsed to one event at the first occurrence). Reduces file size by 100x for typical driving.
- **Checkpoints**: a state snapshot every `checkpointInterval` sim steps (default 60 = 0.25 s at 240 Hz). Plus one more at recording stop time.

Recording starts via `recorder.start()` and stops via `recorder.stop()`. While running, the recorder is called from the app's `onStep` callback to inspect input + state.

`serializeRecording(recorder)` returns a JSON string suitable for download or test bundling.

### Decision: Player semantics

```ts
function replayRun(
  recording: RunRecording,
  vehicleFactory: (deps) => VehicleModel,
  opts?: { tolerance?: { body?: number; wheel?: number } },
): ReplayResult;

interface ReplayResult {
  readonly ok: boolean;
  readonly checkpointResults: readonly {
    readonly step: number;
    readonly maxBodyDiff: number;
    readonly maxWheelDiff: number;
    readonly bodyOk: boolean;
    readonly wheelOk: boolean;
  }[];
  readonly finalDiff: { readonly maxBodyDiff: number; readonly maxWheelDiff: number };
}
```

Default tolerances: body fields within `1e-7`, per-wheel `fz / slip / compression` within `1e-5`. Tighter than the cross-platform default but looser than the in-process `1e-8` because the recording was made in a different test process.

The factory pattern means the same recording can drive any vehicle that implements `VehicleModel`. For R8, the regression test passes a factory that constructs `FourWheelVehicle`. A future rung might pass a factory that constructs a different vehicle and assert that divergence is *bounded* (not zero).

### Decision: Golden fixture generation

The fixture is generated by a one-shot Vitest test (or `npm run` script) that:

1. Constructs a `FourWheelVehicle` deterministically.
2. Drives it through a scripted input sequence:
   - 0–1 s: full throttle
   - 1–2 s: full throttle + steer right
   - 2–3 s: full throttle + steer left
   - 3–4 s: brake
   - 4–5 s: neutral
3. Records every step's input + checkpoints every 60 steps.
4. Writes `fixtures/r7-golden.json`.

The fixture is committed; future regressions in the regression test compare against this file. If R7's defaults change in a future rung that regenerates the fixture, the diff is visible in git.

### Decision: New `R` key binding for live recording

The R0 telemetry capability used `T` for CSV download. R8 adds `R` for "start/stop recording, then download". The recorder subscribes to inputs and snapshots state when started; on stop it serializes and triggers a download.

The key binding is debounced (single press toggles state) and respects the existing focus rules from R0.

### Decision: Module layout

```
src/replay/
  format.ts        RunRecording type, schema constants, version constant
  player.ts        replayRun() and ReplayResult types
  player.test.ts   round-trip tests (record → serialize → replay → match)
  regression.test.ts  golden-fixture replay
  index.ts         barrel

src/telemetry/recorder.ts   Recorder class
src/telemetry/serialize.ts  JSON exporter
src/telemetry/index.ts      re-exports

fixtures/
  r7-golden.json   bundled golden fixture (~few KB)
```

The recorder lives in `telemetry/` because it's parallel to R0's `csv.ts` exporter — both turn the running app's signal stream into a downloadable artifact. The player lives in `replay/` because its consumer is the test infrastructure, not the running app.

## Risks

- **Cross-build numerical noise.** Even on the same lockfile, a JIT recompilation between record-time and replay-time can produce 1-ULP floating-point differences in `Math.sin/atan/sqrt`. Default tolerances `1e-7` body / `1e-5` wheel absorb this. If we see real regressions submerged in noise, tighten one tolerance and document.
- **Fixture staleness across rungs.** The R7 golden fixture is only meaningful against R7's `FourWheelVehicle`. If a later rung changes vehicle defaults (e.g., R8 doesn't, but R9 might), the fixture diverges and the regression test fails. Solution: archive R7's fixture and add a new `r8-golden.json` etc. R8 doesn't pre-build that machinery — it ships one fixture for the current rung.
- **Recorder buffer growth.** A long driving session recording (10+ minutes) could produce a multi-MB JSON. R0's telemetry buffer is bounded (default 144_000 records); the R8 recorder shares that constraint by default. Documented.

## Open questions

- Should the recorder also capture the full per-step CSV output? *No — that's already R0's job. R8's JSON is for replay; CSV is for analysis. Two complementary formats.*
- Should the player support partial replay (resume from a checkpoint mid-recording)? *Defer.* R8 ships start-from-initial only. Resume-from-checkpoint is straightforward to add later if needed.
- Should the regression test fail loudly when the lockfile sha256 differs from the recording's? *No, just warn.* The lockfile hash is informational; the assertion is on numerical divergence.
