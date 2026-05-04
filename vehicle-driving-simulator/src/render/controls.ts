import type { ControlState } from '../input/types.js';

// Reflects the active abstract control state onto a 4-key keyboard widget.
// Derives key highlights from `ControlState` so the same overlay works
// against `KeyboardInputSource` and `SyntheticInputSource` alike. Holding
// both A and D yields steer = 0 → neither key highlights, which is the
// honest representation of what the sim sees.
export class ControlsOverlay {
  private readonly keyW: HTMLElement | null;
  private readonly keyA: HTMLElement | null;
  private readonly keyS: HTMLElement | null;
  private readonly keyD: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.keyW = root.querySelector<HTMLElement>('[data-key="w"]');
    this.keyA = root.querySelector<HTMLElement>('[data-key="a"]');
    this.keyS = root.querySelector<HTMLElement>('[data-key="s"]');
    this.keyD = root.querySelector<HTMLElement>('[data-key="d"]');
  }

  update(control: ControlState): void {
    setPressed(this.keyW, control.throttle > 0);
    setPressed(this.keyS, control.brake > 0);
    setPressed(this.keyA, control.steer < 0);
    setPressed(this.keyD, control.steer > 0);
  }
}

function setPressed(el: HTMLElement | null, pressed: boolean): void {
  if (!el) return;
  if (pressed) {
    el.classList.add('pressed');
  } else {
    el.classList.remove('pressed');
  }
}
