# Design — bicycle-model

## Context

R2 introduces lateral dynamics. Three things change relative to R1:

- The **state vector** grows from `{x, z, heading, speed}` to `{x, z, heading, vx, vy, r}` (with `speed` becoming a derived quantity for telemetry compatibility).
- The **control mapping** for steering changes from "steer → yaw rate" to "steer → steering angle δ at the front wheel". Yaw rate is now an *output* of the dynamics, not a direct command.
- **Forces** replace velocities as the things integrated. Mass `m` and yaw inertia `Iz` show up in the equations of motion.

The linear bicycle model is well-documented (Rajamani, *Vehicle Dynamics and Control*, ch. 2; or Milliken & Milliken, *Race Car Vehicle Dynamics*, ch. 5). We use the standard formulation with cornering stiffness `Cα` and small-angle linearization, with one tweak (low-speed clamp) for numerical robustness.

## Goals / non-goals

Goals:
- Bicycle-model dynamics that produce **observable** lateral velocity and yaw response to steering at speed, with a stable steady-state cornering behavior.
- Replay determinism within `1e-8`, the same threshold used by R0/R1.
- Architecture that R4 (four-wheel raycast) can extend by replacing the per-axle force calculation with per-wheel forces, without rewriting the integrator.
- KinematicVehicle preserved unchanged; its R1 tests must still pass.

Non-goals:
- No nonlinear tire model (saturation). That is R6 Pacejka.
- No load transfer, no per-axle vertical load. That is R4.
- No suspension. That is R7.
- No reverse gear (deferred from R1's open question; the lateral force math handles negative `vx` correctly but the throttle/brake mapping in this rung still clamps speed ≥ 0).
- No camber, no toe, no Ackerman compensation. The single front "wheel" of the bicycle abstracts those away.

## Decisions

### Decision: Linear tire model with cornering stiffness `Cα`

Per axle:

```
F_y = -Cα * α
```

where `α` is the slip angle at that axle. Defaults: `Cαf = Cαr = 80 000 N/rad`. Negative sign because tire lateral force opposes slip.

R5 will replace this with a more physically grounded linear law (per-axle independent stiffnesses derived from a tire dataset). R6 will swap in Pacejka's saturating Magic Formula. The `BicycleVehicle` interface SHALL be written so the per-axle force calculation is a single function call, easy to swap.

### Decision: State and equations

Body-frame state: longitudinal velocity `vx`, lateral velocity `vy`, yaw rate `r`. World-frame state: position `(x, z)`, heading `θ`. Speed = `sqrt(vx² + vy²)`.

Slip angles (front, rear), small-angle approximation acceptable for `|α| < 0.1` rad — the bicycle model is only valid in that regime anyway:

```
α_f = atan2(vy + a*r, vx_safe) - δ
α_r = atan2(vy - b*r, vx_safe)
```

`vx_safe = max(vx, V_MIN_SLIP)` with `V_MIN_SLIP = 0.5 m/s`. This prevents the divide-by-zero that occurs at standstill and the rapid blow-up that occurs as `vx → 0+`. Below this threshold the slip angles read as if the vehicle were moving at `V_MIN_SLIP` longitudinally — which means lateral force is small but well-defined, and yaw response from steering is correspondingly small. Effectively, R2 inherits R1's "no turn at standstill" behavior, just via a different mechanism.

Forces:

```
F_x_drive = throttle * F_DRIVE_MAX
F_x_brake = brake * F_BRAKE_MAX * sign(vx)        // brake opposes motion
F_x_drag  = m * DRAG_DECEL * sign(vx)              // matches R1's coast deceleration when v≠0
F_x = F_x_drive - F_x_brake - F_x_drag
F_yf = -Cαf * α_f
F_yr = -Cαr * α_r
```

Equations of motion (body frame), semi-implicit Euler:

```
vx_dot = F_x / m + vy * r                          // centripetal coupling
vy_dot = (F_yf * cos(δ) + F_yr) / m - vx * r
r_dot  = (a * F_yf * cos(δ) - b * F_yr) / Iz
```

Then world-frame:

```
heading_dot = r
x_dot = vx * sin(heading) + vy * cos(heading)
z_dot = vx * cos(heading) - vy * sin(heading)
```

Integration order (semi-implicit Euler — assigning the *new* values immediately and using them for downstream updates within the same step):

1. Compute slip angles and forces from current state.
2. Update `vx, vy, r`.
3. Update `heading` using new `r`.
4. Update `x, z` using new `vx, vy, heading`.
5. Clamp `vx ≥ 0` (no reverse).

This ordering is deterministic and stable at 240 Hz for the parameter range we use.

### Decision: Default parameters

```
m         = 1500   kg
Iz        = 2500   kg·m²
a         = 1.2    m   (CoG → front axle)
b         = 1.4    m   (CoG → rear axle)
Cαf       = 80000  N/rad
Cαr       = 80000  N/rad
F_DRIVE   = 9000   N   (≈ 6 m/s² at full throttle, matching R1's aMax)
F_BRAKE   = 18000  N   (≈ 12 m/s² braking, matching R1)
DRAG_DECEL= 0.5    m/s² (matches R1)
δ_MAX     = 0.524  rad (~30°)
V_MAX     = 25     m/s (matches R1)
V_MIN_SLIP= 0.5    m/s
```

Equal front/rear cornering stiffness gives neutral steer (no understeer or oversteer to first order). Tunable later if eval signal requires it.

### Decision: Default vehicle switches; kinematic stays for tests

`src/app/index.ts` SHALL construct `new BicycleVehicle()` instead of `new KinematicVehicle()`. KinematicVehicle is exported from `src/vehicle/index.ts` and remains testable. Future rungs can introduce a runtime selector if the eval framework wants side-by-side comparison.

### Decision: Telemetry fields

R2 telemetry adds `vx, vy, yaw_rate, slip_f, slip_r` per record. R1 fields (`heading, speed, x, z`) remain populated. After R0's stable-order rule (alphabetical extras), the new CSV header is:

```
t,step,heading,slip_f,slip_r,speed,vx,vy,x,yaw_rate,z
```

`speed` is computed as `sqrt(vx² + vy²)`. Tools that pinned to R1's exact header are noted in `proposal.md` as a breaking change.

## Risks

- **Numerical instability at high `Cα` and high `vx`.** The bicycle model can become numerically stiff if cornering stiffness is large relative to mass and timestep. At 240 Hz and the chosen defaults, semi-implicit Euler is stable in informal testing; the determinism replay test acts as a regression catch.
- **The low-speed clamp is a small interpretation.** Other simulators blend kinematic ↔ dynamic models below a threshold. We keep one model with a clamp for simplicity; if the smoke test reveals weirdness at low speeds (e.g. heading drift while parked), we revisit in R3 or R4.
- **The bicycle abstraction is a single front and rear "wheel".** Real vehicles split lateral force across left/right wheels with load transfer. R4 (four-wheel-raycast) introduces that split.

## Open questions

- Should `BicycleVehicle` accept a `tireForceFn(α, axle, params)` injection point now to make R5/R6 a single-line swap? *Yes — even if R5 doesn't use it directly, the indirection is cheap and tests are easier.* Implement as a `tireFn` parameter on `BicycleVehicleParams` defaulting to the linear formula.
- Should reverse be enabled in R2? *No — keep clamp at `vx ≥ 0`. Revisit in R4 when load transfer makes braking-while-reversing behaviorally interesting.*
