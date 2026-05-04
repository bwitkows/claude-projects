import { SIM_DT, SimClock } from './clock.js';

export interface SimStep {
  readonly dt: number;
  readonly time: number;
  readonly step: number;
}

export type StepHandler = (s: SimStep) => void;
export type RenderHandler = (alpha: number) => void;

export interface FixedStepLoopOptions {
  readonly onStep: StepHandler;
  readonly onRender?: RenderHandler;
  readonly clock?: SimClock;
  readonly maxStepsPerFrame?: number;
}

export class FixedStepLoop {
  private readonly clock: SimClock;
  private readonly onStep: StepHandler;
  private readonly onRender: RenderHandler | undefined;
  private readonly maxStepsPerFrame: number;
  private accumulator = 0;
  private rafHandle: number | null = null;
  private lastFrameMs = 0;

  constructor(opts: FixedStepLoopOptions) {
    this.clock = opts.clock ?? new SimClock();
    this.onStep = opts.onStep;
    this.onRender = opts.onRender;
    // Cap catch-up steps per frame so a long stall (e.g. tab hidden) does not
    // freeze the page while the loop drains. 480 = ~2s of sim at 240Hz.
    this.maxStepsPerFrame = opts.maxStepsPerFrame ?? 480;
  }

  get simClock(): SimClock {
    return this.clock;
  }

  step(): void {
    const event: SimStep = {
      dt: this.clock.dt,
      time: this.clock.time,
      step: this.clock.step,
    };
    this.onStep(event);
    this.clock.advance();
  }

  stepN(n: number): void {
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`stepN: n must be a non-negative finite number, got ${n}`);
    }
    const count = Math.floor(n);
    for (let i = 0; i < count; i += 1) {
      this.step();
    }
  }

  // Drives the accumulator forward by `realDeltaSeconds` of wall-clock time,
  // running as many fixed sim steps as fit. Sub-step residual is retained for
  // the next call. Pure function of inputs — safe to call from tests.
  advanceRealTime(realDeltaSeconds: number): number {
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0) {
      throw new Error(
        `advanceRealTime: must be a non-negative finite number, got ${realDeltaSeconds}`,
      );
    }
    this.accumulator += realDeltaSeconds;
    let stepped = 0;
    while (this.accumulator >= SIM_DT && stepped < this.maxStepsPerFrame) {
      this.step();
      this.accumulator -= SIM_DT;
      stepped += 1;
    }
    return stepped;
  }

  get accumulatedRemainder(): number {
    return this.accumulator;
  }

  // Browser-only entry point. Drives the loop from requestAnimationFrame.
  run(): void {
    if (typeof requestAnimationFrame !== 'function') {
      throw new Error('run() requires requestAnimationFrame; use step()/stepN() in tests');
    }
    if (this.rafHandle !== null) return;
    this.lastFrameMs = performance.now();
    const tick = (nowMs: number): void => {
      const dtSec = Math.max(0, (nowMs - this.lastFrameMs) / 1000);
      this.lastFrameMs = nowMs;
      this.advanceRealTime(dtSec);
      if (this.onRender) {
        const alpha = this.accumulator / SIM_DT;
        this.onRender(alpha);
      }
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafHandle);
    }
    this.rafHandle = null;
  }
}
