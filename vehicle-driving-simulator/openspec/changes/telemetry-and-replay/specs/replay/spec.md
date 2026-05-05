# replay (delta)

## ADDED Requirements

### Requirement: Run-recording file format

The system SHALL define a `RunRecording` interface (and corresponding JSON serialization) capturing everything required to replay a session deterministically.

A `RunRecording` SHALL contain:

- `version`: integer schema version (R8 ships version 1).
- `rung`: string identifying the rung tag at record time (e.g., `"R7"`).
- `recordedAt`: ISO-8601 UTC timestamp.
- `lockfileSha256`: SHA-256 of the `package-lock.json` at record time (informational — used to scope cross-build comparisons, not enforced).
- `deps`: pinned dep versions present in `package.json` at record time.
- `initial`: vehicle class name, optional params overrides, and initial pose `(x, z, heading)`.
- `events`: array of `{ t: number; state: ControlState }` debounced (only emitted when state changes).
- `checkpoints`: array of `{ step, time, state, wheels }` snapshots at a regular interval.
- `final`: a single `{ step, time, state, wheels }` snapshot at recording stop.

#### Scenario: Recording round-trips through JSON

- GIVEN a `Recorder` that has been driven through a control sequence
- WHEN `serializeRecording(recorder)` is called and the result is `JSON.parse`d
- THEN the resulting object SHALL satisfy the `RunRecording` interface
- AND every numeric field SHALL match the in-memory recording within `1e-15` (round-trip precision)

### Requirement: Recorder debounces events and emits checkpoints

`Recorder` SHALL emit a control event only when the abstract `ControlState` differs from the previously emitted event (debounced). It SHALL emit a state checkpoint every `checkpointInterval` sim steps (default 60) plus one final checkpoint at stop.

#### Scenario: Identical successive control states emit one event

- GIVEN a `Recorder` is `start()`ed
- WHEN `observe()` is called with identical `ControlState` for 10 successive sim steps
- THEN exactly 1 event SHALL be added to the recording

#### Scenario: Checkpoints emit at the configured interval

- GIVEN a `Recorder` with `checkpointInterval = 60`
- WHEN `observe()` is called for 240 sim steps
- THEN at least 4 checkpoints (steps 0, 60, 120, 180 — possibly also 240 final) SHALL appear in the recording

### Requirement: replayRun reproduces checkpoint state within tolerance

`replayRun(recording, vehicleFactory, opts?)` SHALL drive a fresh vehicle through `recording.events` via a `SyntheticInputSource` and compare per-step state against `recording.checkpoints`.

Default tolerances:
- body fields (`x, z, heading, speed, vx, vy, yawRate, slipF, slipR`): max abs delta `< 1e-7`
- per-wheel fields (`fz, slip, compression`): max abs delta `< 1e-5`

`replayRun` SHALL return a `ReplayResult` with per-checkpoint divergence numbers and an overall pass/fail.

#### Scenario: Replay reproduces every checkpoint within tolerance

- GIVEN a `RunRecording` produced by recording a `FourWheelVehicle` for 240 sim steps
- WHEN `replayRun(recording, FourWheelVehicleFactory)` is called
- THEN `result.ok` SHALL be `true`
- AND every entry in `result.checkpointResults` SHALL have `bodyOk == true && wheelOk == true`

#### Scenario: Replay detects perturbation

- GIVEN a `FourWheelVehicleFactory` that constructs a vehicle with `cAlpha` doubled (perturbed)
- WHEN `replayRun(recording, perturbedFactory)` is called against an unperturbed recording
- THEN at least one checkpoint SHALL have `bodyOk == false || wheelOk == false`
- AND the failing checkpoint's `maxBodyDiff` or `maxWheelDiff` SHALL be greater than the tolerance

### Requirement: Vehicle factory abstracts over rung implementation

`vehicleFactory` SHALL be a function `(deps: { world, terrain, params? }) => VehicleModel`. The same recording can drive any factory whose vehicle implements the `VehicleModel` interface, enabling cross-rung divergence measurement in future use.

#### Scenario: Same recording drives different vehicle implementations

- GIVEN a `RunRecording` made from `FourWheelVehicle`
- WHEN `replayRun` is called twice — once with a `FourWheelVehicle` factory, once with a `BicycleVehicle` factory
- THEN both calls SHALL complete without error
- AND the second call's `result.ok` MAY be `false` (legitimate cross-rung divergence)

### Requirement: Golden fixture and regression test

The repository SHALL include `fixtures/r7-golden.json` — a 5-second `FourWheelVehicle` recording produced from the `r7-complete` build via a deterministic scripted control sequence (full throttle → throttle + steer right → throttle + steer left → brake → neutral, each phase 1 second).

A Vitest regression test SHALL load this fixture and replay it on every CI run. The test SHALL fail loudly if checkpoint state drifts beyond the default tolerances.

#### Scenario: Golden fixture passes regression on the current build

- WHEN `npm test` runs the regression test
- THEN replaying `fixtures/r7-golden.json` against the current `FourWheelVehicle` SHALL pass within default tolerances
- AND the test SHALL print divergence summary numbers regardless of pass/fail

### Requirement: Live recorder key binding

The running app SHALL bind a key (default `R`) that toggles recording on/off. On stop, the app SHALL trigger a JSON download of the serialized recording.

#### Scenario: R key starts recording, second R stops and downloads

- WHEN the user is on the running app with focus
- AND the user presses `R`
- THEN the recorder SHALL transition to `running`
- AND a visible indicator (text or icon) SHALL display recording status
- WHEN the user presses `R` again
- THEN the recorder SHALL stop and trigger a download of the serialized recording
