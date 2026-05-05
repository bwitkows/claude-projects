# telemetry (delta)

## ADDED Requirements

### Requirement: Recorder factory

The telemetry capability SHALL provide a `Recorder` class and factory function (`recordRun(opts) => Recorder`) parallel to the existing `TelemetryBuffer`. The recorder is the producer for the JSON replay format defined by the `replay` capability.

#### Scenario: recordRun returns a fresh recorder

- WHEN `recordRun({ checkpointInterval: 60 })` is called
- THEN it SHALL return a `Recorder` whose `isRunning()` is `false`
- AND `recorder.start()` transitions it to running
- AND `recorder.stop()` transitions it back to not running

### Requirement: serializeRecording exporter

The telemetry capability SHALL provide `serializeRecording(recorder): string` returning a JSON string suitable for download. The output SHALL parse to a `RunRecording` (per the `replay` capability spec) and round-trip through `JSON.parse` to a structurally equivalent recording.

#### Scenario: serialized output is valid JSON

- WHEN `serializeRecording(recorder)` is called on a recorder with at least one checkpoint
- THEN `JSON.parse(serializeRecording(recorder))` SHALL succeed
- AND the parsed object SHALL have `version === 1` and an `events` array and a `checkpoints` array

### Requirement: Recording does not interfere with CSV telemetry

The `Recorder` and the existing `TelemetryBuffer` SHALL coexist in the running app. Both subscribe to the same `onStep` callback; neither modifies the other's state.

#### Scenario: Both recorders run simultaneously

- GIVEN a running `bootstrap()` instance with both an active recording session AND the existing CSV-buffered telemetry
- WHEN the user drives the vehicle
- THEN the CSV telemetry buffer SHALL accumulate per-step records (R0 behavior preserved)
- AND the JSON recording SHALL accumulate debounced events + checkpoints
- AND pressing `T` SHALL still trigger a CSV download (R0 behavior preserved)
- AND pressing `R` SHALL trigger a JSON download (R8 behavior added)
