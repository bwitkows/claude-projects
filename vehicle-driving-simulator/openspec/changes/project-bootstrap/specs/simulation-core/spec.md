# simulation-core (delta)

## ADDED Requirements

### Requirement: Fixed-timestep simulation loop

The system SHALL run a simulation loop at a fixed timestep, decoupled from the render frame rate. The default timestep SHALL be 1/240 second.

#### Scenario: Multiple sim steps per render frame

- WHEN real time elapsed since the last frame exceeds one timestep
- THEN one sim step SHALL be executed for each whole timestep elapsed
- AND any sub-timestep residual SHALL be retained in an accumulator for the next frame
- AND rendering SHALL occur once per `requestAnimationFrame` callback, not once per sim step

#### Scenario: Render frame stall does not skip steps

- WHEN a render frame is delayed by more than one timestep
- THEN on the next frame, all missed steps SHALL be executed in order before rendering

### Requirement: Deterministic step API

The simulation core SHALL produce identical state given an identical sequence of input events and an identical initial state.

#### Scenario: Replay equivalence

- GIVEN an identical initial world state and a recorded input sequence of N events
- WHEN the simulation is run twice with that input sequence
- THEN every body's position, orientation, linear velocity, and angular velocity SHALL match across both runs to within 1e-8 after each step

### Requirement: Monotonic sim clock

The simulation SHALL expose a monotonic sim time, in seconds, advanced by exactly one timestep per sim step. The sim clock SHALL NOT depend on `Date.now`, `performance.now`, or wall-clock time.

#### Scenario: Sim time advances exactly per step

- GIVEN a sim clock at time `t0`
- WHEN N sim steps are executed
- THEN the sim clock SHALL read `t0 + N * (1/240)` exactly (within float64 precision)

### Requirement: Step API surface

The simulation core SHALL expose `step()`, `stepN(n: number)`, and `run()` functions. `step` and `stepN` SHALL be synchronous and SHALL NOT depend on `requestAnimationFrame`. `run` SHALL drive the loop from `requestAnimationFrame` and is intended for the browser; tests MUST use `step` / `stepN`.

#### Scenario: Headless stepping under Vitest

- WHEN a Vitest test imports the sim core in node and calls `stepN(100)`
- THEN 100 sim steps SHALL be executed
- AND no DOM API SHALL be touched
