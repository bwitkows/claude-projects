export const SIM_HZ = 240;
export const SIM_DT = 1 / SIM_HZ;

export class SimClock {
  private _step = 0;

  get dt(): number {
    return SIM_DT;
  }

  get hz(): number {
    return SIM_HZ;
  }

  get step(): number {
    return this._step;
  }

  // Sim time is computed from the step index rather than accumulated, so it is
  // free of accumulator rounding error and matches `step * SIM_DT` exactly
  // within float64 precision.
  get time(): number {
    return this._step * SIM_DT;
  }

  advance(): void {
    this._step += 1;
  }

  reset(): void {
    this._step = 0;
  }
}
