import { type ControlState, type InputSource, NEUTRAL_CONTROL } from './types.js';

interface KeyState {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
}

export interface KeyboardInputOptions {
  readonly target?: Window | undefined;
}

// Listens to keydown/keyup on `target` and computes the abstract control
// state on demand via `read()`. The sim core samples once per step, so
// updates from DOM events between samples cannot affect the in-progress step.
export class KeyboardInputSource implements InputSource {
  private readonly target: Window;
  private readonly keys: KeyState = { w: false, s: false, a: false, d: false };
  private readonly downHandler: (e: KeyboardEvent) => void;
  private readonly upHandler: (e: KeyboardEvent) => void;

  constructor(opts: KeyboardInputOptions = {}) {
    const target = opts.target ?? (typeof window !== 'undefined' ? window : undefined);
    if (!target) {
      throw new Error('KeyboardInputSource requires a window target (DOM environment).');
    }
    this.target = target;
    this.downHandler = (e) => this.set(e.key, true);
    this.upHandler = (e) => this.set(e.key, false);
    this.target.addEventListener('keydown', this.downHandler);
    this.target.addEventListener('keyup', this.upHandler);
  }

  private set(key: string, down: boolean): void {
    const k = key.toLowerCase();
    if (k === 'w' || k === 's' || k === 'a' || k === 'd') {
      this.keys[k] = down;
    }
  }

  read(_simTime: number): ControlState {
    const throttle = this.keys.w ? 1 : 0;
    const brake = this.keys.s ? 1 : 0;
    const left = this.keys.a ? -1 : 0;
    const right = this.keys.d ? 1 : 0;
    const steer = left + right; // both held => 0
    return { throttle, brake, steer };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.downHandler);
    this.target.removeEventListener('keyup', this.upHandler);
    this.keys.w = this.keys.s = this.keys.a = this.keys.d = false;
  }

  // Test helper: simulate `read()` returning neutral if no listener has fired.
  static neutral(): ControlState {
    return NEUTRAL_CONTROL;
  }
}
