# Design — linear-tire-model

## Context

R5 is a focused tire-physics rung. The chassis dynamics from R4 (Rapier-backed body, locked Y/pitch/roll, per-wheel raycast, quasi-static `F_z`) carry over unchanged. Only two things change: how slip angle is computed (per wheel, not per axle), and how lateral force is computed (load-sensitive linear law, applied at wheel contact points).

The change is small in lines but architecturally consequential — R6 (Pacejka) and R7 (suspension dynamics) both consume per-wheel slip and the `TireModel` extension seam.

## Goals / non-goals

Goals:
- Per-wheel slip angle that differs left-vs-right at non-zero yaw rate.
- Linear, load-sensitive tire force `F_y_wheel = -cα · F_z_wheel · α_wheel`.
- Force applied at each wheel's world contact point, so the body experiences the right per-wheel yaw moment without hand-coding `a·F_yf - b·F_yr`.
- A clean `TireModel` interface that R6 swaps in.
- Determinism preserved at `1e-8` (same Rapier solver as R4; tire force calculation is a pure function of state).

Non-goals:
- No saturation. F_y is unbounded in α — that's R6.
- No combined slip (longitudinal + lateral). R6 / future work.
- No camber, no toe, no per-wheel longitudinal slip. R7 / out of scope.
- No reverse gear (still deferred).

## Decisions

### Decision: Per-wheel velocity in body frame

For a body translating with body-frame velocity `(B_X, B_Z)` (lateral, longitudinal) and rotating with yaw rate `r` (R1 sign convention: positive = right turn), a point at body-frame offset `(rx, _, rz)` has body-frame velocity:

```
v_x_at_point = B_X + r · rz
v_z_at_point = B_Z − r · rx
```

(Derived from the kinematics of a rigid body — see four-wheel.ts implementation comment.)

For each wheel:

| Wheel | rx        | rz   |
|-------|-----------|------|
| FL    | −W/2      | +a   |
| FR    | +W/2      | +a   |
| RL    | −W/2      | −b   |
| RR    | +W/2      | −b   |

So:

```
v_x_FL = B_X + r·a       v_z_FL = B_Z + r·W/2
v_x_FR = B_X + r·a       v_z_FR = B_Z − r·W/2
v_x_RL = B_X − r·b       v_z_RL = B_Z + r·W/2
v_x_RR = B_X − r·b       v_z_RR = B_Z − r·W/2
```

### Decision: Per-wheel slip angle

```
α_wheel = atan2(v_x_at_wheel, v_z_safe_at_wheel) − δ_wheel
```

where `v_z_safe = max(v_z, V_MIN_SLIP)` and `δ_wheel = δ` for front wheels, `0` for rear wheels. `V_MIN_SLIP = 0.5 m/s` (matches R2's clamp).

At zero yaw rate and zero steer, all four slip angles are zero. At non-zero yaw rate the left-vs-right asymmetry shows up as different `v_z` denominators — at high yaw rate the inside wheel sees a smaller `v_z` than the outside wheel, so its slip angle magnitude is larger. This is correct physics for a turning vehicle.

### Decision: Linear tire law with load sensitivity

```
F_y_wheel = -cα · F_z_wheel · α_wheel
```

`cα` units: `1/rad` (cornering stiffness coefficient). Default `cα = 10.1`.

Why 10.1: at static load on level terrain the front axle carries `m·g·b/L = 1500·9.81·1.4/2.6 = 7920 N`. With `cα = 10.1`, per-axle stiffness `cα·F_z_axle = 80,000 N/rad` matches R2's bicycle `Cα = 80,000 N/rad` exactly. That makes the straight-line steering response of R5 indistinguishable from R4 at the moment of release; cornering response diverges as soon as weight transfer starts.

### Decision: TireModel interface

```ts
interface TireModel {
  lateralForce(slip: number, fz: number, axle: 'front' | 'rear'): number;
}

class LinearTireModel implements TireModel {
  constructor(readonly cAlpha: number) {}
  lateralForce(slip, fz, _axle) { return -this.cAlpha * fz * slip; }
}
```

`axle` is passed even though `LinearTireModel` ignores it — R6 (Pacejka) may parameterize differently per axle.

`FourWheelVehicleParams` gains an optional `tireModel?: TireModel` (default `new LinearTireModel(10.1)`).

### Decision: Force application at wheel contact points

R4 applied lateral force at axle midpoints. R5 applies it at each wheel's world contact point, in the body's `+X` direction (right-positive). This means:

- Two wheel forces at the front axle, each at offset `(±W/2, *, +a)` body-frame.
- Two wheel forces at the rear axle, each at offset `(±W/2, *, −b)` body-frame.

The yaw moment per wheel is `r × F = (−W/2 or +W/2 in body x) × (F_y in body x) + (rz · F_y in z) ...`. A symmetric pair of wheels (same F_y left and right) produces the same total yaw moment as the per-axle force at the midpoint. Asymmetric pairs (different F_y left vs right under load transfer) produce a *different* yaw moment, which is the R5 effect.

### Decision: Drive force application unchanged

Drive at rear wheels (RWD) and brake at all four — R4's behavior. R5 does not change longitudinal force application.

### Decision: WheelState gains a `slip` field

```ts
interface WheelState {
  position: Vec3;
  contact: boolean;
  contactDistance: number;
  fz: number;
  slip: number;        // R5 NEW — radians
}
```

`slip` is populated by `step()` after the per-wheel slip-angle calculation. Tests assert it matches the closed-form formula above.

`state.slipF` and `state.slipR` are kept for telemetry compatibility — they are now `(slip_FL + slip_FR) / 2` and `(slip_RL + slip_RR) / 2` respectively. Equal to per-axle slip when left=right (zero yaw rate); they diverge under cornering by an amount proportional to `r·W/(2·v_z)`, typically <1% at sane speeds and steer angles.

### Decision: Default tire model selected by app

`src/app/index.ts` constructs `FourWheelVehicle` without specifying `tireModel`, getting `LinearTireModel(10.1)` by default. R6 will pass an explicit Pacejka model.

## Risks

- **`cα = 10.1` is tuned for the chosen `b/L` ratio.** If a future rung changes the `a/b` distribution, the front/rear stiffness should retune to preserve neutral steer. Document in design.md when that happens.
- **At very low speeds, `vxSafe` clamps in to per-wheel velocity computations the same way it clamps the per-axle one.** This is intentional and matches R2/R4 — slip angles stay finite at standstill.
- **Forces at wheel contact points create a yaw moment from longitudinal forces that isn't perfectly symmetric** if the wheels are at slightly different `F_z` (lateral transfer). Drive force at RL vs RR with different `F_z` produces a small lateral force imbalance? No — drive force is split equally regardless of `F_z`. R6/R7 may revisit if differential modeling enters.

## Open questions

- Should `cα` be per-axle (`cαFront`, `cαRear`) for tunability? *Defer — `LinearTireModel` takes a single `cα`. If different stiffnesses are wanted, construct two `LinearTireModel` instances (per-axle dispatch is in `tireModel.lateralForce(_, _, axle)`).* Not implemented now to keep the change small.
- Should longitudinal slip ratio be added to the tire model now? *No — R5 is "slip-angle → lateral force in the linear regime." Longitudinal slip is R6 / R7 territory if needed.*
