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
