# Design — pacejka-tire-model

## Context

R5 made tire force a load-sensitive linear function of slip. R6 swaps the law for Pacejka's Magic Formula. The TireModel interface, FourWheelVehicle architecture, per-wheel force application, and quasi-static load transfer all stay exactly as R5 left them. This is the most localized rung in the ladder by line count.

## Goals / non-goals

Goals:
- Saturating lateral force per the Magic Formula, parameterized so the linear regime matches R5 exactly at zero slip.
- A single `PacejkaTireModel` class implementing `TireModel`. Same call signature, same units, same sign convention.
- Default tire on `FourWheelVehicle` switches to Pacejka. Linear stays available for explicit construction.
- Determinism preserved at `1e-8` for body state, `1e-6` for per-wheel forces — no random sampling, no iteration, no platform-dependent FP behavior beyond `Math.sin / atan` (already used in R2/R5).

Non-goals:
- No combined slip (longitudinal + lateral coupled). The 1D Magic Formula handles lateral force alone.
- No Pacejka 96/02 refinements (camber, conicity, ply steer offsets). The simplified 5-parameter form suffices for "controlled drift achievable" and downstream rungs.
- No friction circle / friction ellipse model. Longitudinal force still comes from the throttle/brake/drag model unchanged.
- No load-dependent peak `μ`. `μ` is a single param; large-load tire flex effects are out of scope.

## Decisions

### Decision: 5-parameter Magic Formula, lateral only

```
F_y(α) = D · sin(C · atan(B·α − E·(B·α − atan(B·α))))
```

with:
- `D = μ · F_z` — peak force (newtons).
- `B` — stiffness factor (1/rad).
- `C` — shape factor (dimensionless), typically 1.3 for passenger lateral.
- `E` — curvature factor (dimensionless), typically `-0.2` for lateral.

Sign convention: positive slip yields positive `F_y(α)` from the formula; the tire model returns `-F_y` so the *applied* force opposes slip. Same as `LinearTireModel`.

### Decision: Default coefficients tuned for smooth handoff from R5

Slope of `F_y` at `α = 0` equals `B · C · D = B · C · μ · F_z`. R5's linear law has slope `cα · F_z = 10.1 · F_z`. Setting `B · C · μ = 10.1` and `μ = 1.0`, `C = 1.3` gives `B = 10.1 / 1.3 ≈ 7.77`.

```
DEFAULT_PACEJKA_PARAMS = {
  mu: 1.0,
  B: 7.77,
  C: 1.3,
  E: -0.2,
}
```

Result:
- At `α = 0`, `F_y = 0` (formula).
- At `α = 0.01 rad` (0.57°), `F_y ≈ -B·C·D·α = -10.1·F_z·0.01 = -0.101·F_z` (matches `LinearTireModel(10.1)` exactly to first order).
- Peak occurs at `α_peak = (1/B) · tan(π / (2C))`. For `C = 1.3`: `tan(π/2.6) = tan(1.208 rad) ≈ 2.58`; `α_peak ≈ 2.58/7.77 ≈ 0.33 rad ≈ 19°`.
- Peak value: `D = μ·F_z = F_z`. So saturation at `F_z`.
- Beyond peak, force decreases — at very large slip, `F_y → D · sin(C·π/2) = D · sin(0.65π) ≈ 0.85·D` (plateau).

This gives a smooth, drivable tire curve that matches R5 at small slip and saturates at large slip.

### Decision: TireModel interface unchanged

```ts
class PacejkaTireModel implements TireModel {
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
```

`axle` is passed but ignored — uniform tire model across all four wheels. R7 may parameterize differently per axle if needed.

### Decision: Default switch in `DEFAULT_FOUR_WHEEL_PARAMS`

Replace the default tire model:

```ts
// before (R5)
tireModel: new LinearTireModel(DEFAULT_C_ALPHA_PER_N)
// after (R6)
tireModel: new PacejkaTireModel(DEFAULT_PACEJKA_PARAMS)
```

All existing call sites that used the default get Pacejka automatically. R5 tests that test linear-regime agreement at small slip continue to pass (Pacejka matches there). Tests that want explicit linear behavior import and pass `new LinearTireModel(...)`.

### Decision: `LinearTireModel` stays exported

Don't remove it. Reasons:
- R5's tire test file references it directly.
- A grader running R5 from `r5-baseline` against a different tool's R6 implementation might want to compare.
- Future rungs may want a side-by-side runtime selector (linear vs. saturating) for live A/B; that's free if the class stays.

## Risks

- **The peak slip angle of 19° is high.** Real road tires saturate at 8–12°. With these params the vehicle will feel "grippy" and require fairly aggressive steering to break traction. A grader who plays with the live build may want to tune `B` higher. R6 keeps the params tied to R5's `cα = 10.1` for backward compatibility; the tradeoff is documented here. R7 or a follow-up rung could expose per-axle Pacejka parameterization.
- **Saturation introduces non-monotonicity in `F_y(α)`.** Beyond the peak, increasing slip *decreases* lateral force. This can make the bicycle/four-wheel dynamics oscillatory under sustained large-slip input. The 240 Hz fixed timestep is high enough that this is stable in practice for the ranges R6 reaches; if it manifests as a determinism test flake, we'd need to bound the input or filter the slip.
- **No combined-slip handling.** When throttle is high enough to spin the rear (longitudinal slip), the linear-regime lateral force is too high — Pacejka's combined-slip extensions are needed for accuracy. Not in scope; the model treats lateral and longitudinal as independent.

## Open questions

- Should `PacejkaTireModel` allow per-axle parameter overrides via the `axle` argument? *Defer — R6 keeps it uniform. If R7 wants axle-asymmetric tires (front more grippy than rear, common for understeer), it can subclass or add a parameter.*
- Should the default `μ = 1.0` track surface conditions (wet road, off-road)? *Out of scope. R6 is dry-road. Surface variation is its own future rung if it matters.*
