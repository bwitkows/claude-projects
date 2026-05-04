// Tire-force model. R5 ships the linear regime; R6 (Pacejka) will swap a
// saturating implementation in via the same interface.
//
// Convention: slip > 0 means the tire is slipping toward body +X (right).
// Lateral force opposes slip, so for slip > 0 the force points body -X.
// `axle` is passed for downstream models that may parameterize differently
// per axle; LinearTireModel ignores it.

export type AxleId = 'front' | 'rear';

export interface TireModel {
  lateralForce(slip: number, fz: number, axle: AxleId): number;
}

// Linear, load-sensitive tire force: F_y = -cα · F_z · α.
// cα has units 1/rad — cornering stiffness coefficient per unit normal load.
//
// At F_z = m·g·b/L = 7920 N (front axle static load) and cα = 10.1, the
// per-axle stiffness `cα · F_z_axle = 80,000 N/rad` exactly equals R2's
// bicycle Cα. Straight-line steering response of R5 matches R4 at the
// moment of release; cornering response diverges as weight transfer kicks
// in.
export class LinearTireModel implements TireModel {
  constructor(readonly cAlpha: number) {}

  lateralForce(slip: number, fz: number, _axle: AxleId): number {
    return -this.cAlpha * fz * slip;
  }
}

export const DEFAULT_C_ALPHA_PER_N = 10.1;

// Pacejka Magic Formula parameters for the simplified 5-parameter lateral
// model. Sign convention identical to LinearTireModel: applied force
// opposes slip (the leading minus sign is in the lateralForce method).
//
// Defaults are tuned for smooth handoff from R5's LinearTireModel(10.1):
// slope at zero slip is `B · C · μ = 7.77 · 1.3 · 1.0 = 10.1` exactly,
// matching cα. Saturation peak is at α_peak = (1/B) · tan(π/(2C)) ≈ 0.33 rad
// (~19°). Beyond the peak, force decreases — the saturating behavior that
// makes controlled drift physically possible.
export interface PacejkaParams {
  readonly mu: number; // peak friction coefficient (μ)
  readonly B: number; // stiffness factor (1/rad)
  readonly C: number; // shape factor (~1.3 for passenger lateral)
  readonly E: number; // curvature factor (~-0.2 for lateral)
}

export const DEFAULT_PACEJKA_PARAMS: PacejkaParams = Object.freeze({
  mu: 1.0,
  // B = cα / (μ·C) — derived rather than typed (7.77 rounded), so the slope
  // at zero slip equals cα·F_z = 10.1·F_z EXACTLY rather than within 1e-4.
  B: DEFAULT_C_ALPHA_PER_N / (1.0 * 1.3),
  C: 1.3,
  E: -0.2,
});

export class PacejkaTireModel implements TireModel {
  constructor(readonly params: PacejkaParams) {}

  lateralForce(slip: number, fz: number, _axle: AxleId): number {
    if (fz <= 0) return 0;
    const { mu, B, C, E } = this.params;
    const D = mu * fz;
    const Ba = B * slip;
    const x = Ba - E * (Ba - Math.atan(Ba));
    return -D * Math.sin(C * Math.atan(x));
  }
}
