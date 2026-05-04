# telemetry (delta)

## ADDED Requirements

### Requirement: Per-step telemetry records

The system SHALL record one telemetry record per simulation step into a bounded ring buffer.

#### Scenario: Record produced each step

- GIVEN an empty buffer with capacity C
- WHEN N simulation steps are executed
- THEN `min(N, C)` records SHALL be present in the buffer
- AND records SHALL appear in chronological order

#### Scenario: Old records dropped when buffer full

- GIVEN the buffer contains C records (full)
- WHEN one further sim step occurs
- THEN the oldest record SHALL be evicted
- AND the newest record SHALL occupy the most recent slot

### Requirement: Telemetry record schema

Each record SHALL contain at minimum:

- `t: number` — sim time in seconds (float64)
- `step: number` — monotonic step index (integer)

Additional fields MAY be added by future capabilities (e.g., `vehicle-dynamics` will add `vx`, `vy`, `slip_f`, `slip_r` etc.). The schema is open for extension; field order in CSV output SHALL be stable for a given build.

### Requirement: CSV export

The system SHALL provide a function `exportCsv(): string` returning the current buffer as CSV.

#### Scenario: CSV header and rows

- WHEN `exportCsv` is called
- THEN the first line of the returned string SHALL be a comma-separated header listing field names in the schema's stable order
- AND each subsequent line SHALL correspond to one record in chronological order
- AND numeric values SHALL be serialized with sufficient precision to round-trip a float64 (at least 17 significant digits when needed)

### Requirement: User-triggered export

The system SHALL bind a key (default: `T`) that triggers a CSV download of the current buffer when the page has focus.

#### Scenario: T key downloads CSV

- WHEN the user presses `T` while the page has focus
- THEN the browser SHALL initiate a download of a `.csv` file
- AND the file content SHALL match the output of `exportCsv()` at the time of the keypress

### Requirement: Default capacity

The default ring buffer capacity SHALL be 144000 records (≈10 minutes at 240 Hz). Capacity SHALL be configurable at construction time.
