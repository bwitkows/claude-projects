import { type ControlState, type InputSource, NEUTRAL_CONTROL } from './types.js';

export interface ControlEvent {
  readonly t: number;
  readonly state: ControlState;
}

// Replays a recorded sequence of (t, state) events. At sim time `simTime`,
// the active state is the latest entry whose `t <= simTime`. If no entry
// satisfies this, the neutral state is returned.
export class SyntheticInputSource implements InputSource {
  private readonly events: ControlEvent[];

  constructor(events: readonly ControlEvent[]) {
    // Defensive copy + sort ensures determinism regardless of caller's order.
    this.events = [...events].sort((a, b) => a.t - b.t);
  }

  read(simTime: number): ControlState {
    let active: ControlState = NEUTRAL_CONTROL;
    for (const ev of this.events) {
      if (ev.t > simTime) break;
      active = ev.state;
    }
    return active;
  }
}
