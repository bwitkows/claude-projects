// Procedural heightmap defined by a sum of three sine bands. Pure function of
// (x, z) — no random calls, no caching, no platform-specific FP behavior, so
// two runs on the same lockfile produce identical heights.
//
// Phase offsets (1.7, -0.5, 2.3, 1.1) are arbitrary and only break the
// symmetry that pure sin*cos products would have. They are part of the spec.

export interface HeightmapParams {
  readonly aLarge: number;
  readonly lLarge: number;
  readonly aMed: number;
  readonly lMed: number;
  readonly aSmall: number;
  readonly lSmall: number;
}

export const DEFAULT_HEIGHTMAP_PARAMS: HeightmapParams = Object.freeze({
  aLarge: 4,
  lLarge: 60,
  aMed: 1.5,
  lMed: 18,
  aSmall: 0.4,
  lSmall: 6,
});

// Phase offsets are baked-in constants, not params, because changing them
// changes the world; a different choice would be a different heightmap.
const PHASE_MED_X = 1.7;
const PHASE_MED_Z = -0.5;
const PHASE_SMALL_X = 2.3;
const PHASE_SMALL_Z = 1.1;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class Heightmap {
  readonly params: HeightmapParams;

  constructor(params: Partial<HeightmapParams> = {}) {
    this.params = { ...DEFAULT_HEIGHTMAP_PARAMS, ...params };
  }

  heightAt(x: number, z: number): number {
    const p = this.params;
    return (
      p.aLarge * Math.sin(x / p.lLarge) * Math.cos(z / p.lLarge) +
      p.aMed * Math.sin(x / p.lMed + PHASE_MED_X) * Math.cos(z / p.lMed + PHASE_MED_Z) +
      p.aSmall * Math.sin(x / p.lSmall + PHASE_SMALL_X) * Math.cos(z / p.lSmall + PHASE_SMALL_Z)
    );
  }

  // Closed-form ∂h/∂x. Each term contributes via the chain rule on sin(x/L).
  partialX(x: number, z: number): number {
    const p = this.params;
    return (
      (p.aLarge / p.lLarge) * Math.cos(x / p.lLarge) * Math.cos(z / p.lLarge) +
      (p.aMed / p.lMed) * Math.cos(x / p.lMed + PHASE_MED_X) * Math.cos(z / p.lMed + PHASE_MED_Z) +
      (p.aSmall / p.lSmall) *
        Math.cos(x / p.lSmall + PHASE_SMALL_X) *
        Math.cos(z / p.lSmall + PHASE_SMALL_Z)
    );
  }

  // Closed-form ∂h/∂z. cos(z/L) differentiates to -sin(z/L)/L, hence the minus.
  partialZ(x: number, z: number): number {
    const p = this.params;
    return (
      -(p.aLarge / p.lLarge) * Math.sin(x / p.lLarge) * Math.sin(z / p.lLarge) -
      (p.aMed / p.lMed) * Math.sin(x / p.lMed + PHASE_MED_X) * Math.sin(z / p.lMed + PHASE_MED_Z) -
      (p.aSmall / p.lSmall) *
        Math.sin(x / p.lSmall + PHASE_SMALL_X) *
        Math.sin(z / p.lSmall + PHASE_SMALL_Z)
    );
  }

  // The +Y-pointing surface normal is normalize(T_z × T_x) where
  // T_x = (1, ∂h/∂x, 0) and T_z = (0, ∂h/∂z, 1). The cross product expands
  // to (-∂h/∂x, 1, -∂h/∂z); normalizing gives a unit vector with positive y.
  normalAt(x: number, z: number): Vec3 {
    const hx = this.partialX(x, z);
    const hz = this.partialZ(x, z);
    const len = Math.sqrt(hx * hx + 1 + hz * hz);
    return { x: -hx / len, y: 1 / len, z: -hz / len };
  }
}
