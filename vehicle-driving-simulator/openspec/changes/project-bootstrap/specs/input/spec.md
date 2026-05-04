# input (delta)

## ADDED Requirements

### Requirement: Abstract control event surface

The input system SHALL expose abstract control events to the simulation core. The control state SHALL contain at least:

- `throttle: number` in `[0, 1]`
- `brake: number` in `[0, 1]`
- `steer: number` in `[-1, +1]` (negative = left)

Concrete input devices (keyboard now; gamepad/wheel later) SHALL map their inputs to this abstract state. The simulation core SHALL read only this abstract state and SHALL NOT touch DOM events directly.

#### Scenario: Keyboard mapping

- WHEN the user holds `W`
- THEN `throttle` SHALL be 1 while held and 0 when released
- WHEN the user holds `S`
- THEN `brake` SHALL be 1 while held and 0 when released
- WHEN the user holds `A`
- THEN `steer` SHALL be -1 while held
- WHEN the user holds `D`
- THEN `steer` SHALL be +1 while held
- WHEN the user holds both `A` and `D`
- THEN `steer` SHALL be 0

### Requirement: Synthetic input source

The input system SHALL accept a synthetic input source that drives control state from a recorded sequence rather than from DOM events, enabling deterministic tests.

#### Scenario: Synthetic source replaces keyboard in tests

- GIVEN a synthetic source providing `[(t0, state0), (t1, state1), ...]`
- WHEN the simulation is stepped
- THEN at sim time `t`, the active control state SHALL be the latest entry whose timestamp is `<= t`
- AND no keyboard event listeners SHALL be required

### Requirement: Input read once per step

The simulation core SHALL sample the control state exactly once per sim step, before physics integration for that step. Mid-step changes to control state SHALL NOT affect the current step's physics.

#### Scenario: Input freezes during a step

- GIVEN sim step `n` begins with `throttle = 0.5`
- WHEN the keyboard handler updates `throttle = 1.0` while step `n` is executing
- THEN step `n` SHALL use `throttle = 0.5`
- AND step `n+1` SHALL use `throttle = 1.0`
