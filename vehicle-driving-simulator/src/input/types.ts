export interface ControlState {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
}

export const NEUTRAL_CONTROL: ControlState = Object.freeze({
  throttle: 0,
  brake: 0,
  steer: 0,
});

export interface InputSource {
  // Returns the control state to use for the sim step starting at `simTime`.
  // Implementations MUST be pure with respect to `simTime` and any internal
  // event log; they MUST NOT mutate visible state during a sim step.
  read(simTime: number): ControlState;
  dispose?(): void;
}
