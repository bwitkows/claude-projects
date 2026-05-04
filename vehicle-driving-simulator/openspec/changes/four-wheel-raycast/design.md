# Design — four-wheel-raycast

## Context

R4 introduces the largest architectural shift on the rung ladder. Three things change relative to R3:

- The vehicle's pose is integrated by **Rapier**, not by hand. `state.x`, `state.z`, `state.heading`, `state.vx`, `state.vy`, `state.yawRate` are derived from the Rapier rigid body each step.
- The vehicle has **four wheel hardpoints** (body-frame positions). Each wheel does a downward raycast against the terrain collider; the per-wheel state — contact, distance, normal force `F_z` — is exposed in `state.wheels`.
- **Weight transfer** is computed quasi-statically from longitudinal / lateral acceleration, distributed across the four wheels per a standard rigid-vehicle load-transfer formula. R7 (suspension) will replace this with spring/damper dynamics that produce the same load transfer dynamically.

The pivot has knock-on effects: physics step semantics change (Rapier now does work), the vehicle constructor needs the world reference, and the determinism guarantee shifts from "hand-integrated semi-implicit Euler" to "Rapier solver".

## Goals / non-goals

Goals:
- Per-wheel raycast that returns contact / distance / normal in a deterministic, replay-stable way.
- Quasi-static `F_z` per wheel that sums to `m·g` at rest and shifts with longitudinal / lateral acceleration.
- Force application **at wheel positions** rather than at the CoG, so yaw moment from lateral force emerges from geometry (not from `a·F_yf − b·F_yr`).
- Replay equivalence within `1e-8` across two runs of identical input — Rapier's single-threaded WASM solver is deterministic at the precision we need (R0's physics test already proved this for free-fall).
- Backward compatibility for `KinematicVehicle` and `BicycleVehicle` — they stay importable, their R1/R2 tests pass unchanged, and they still drive on a flat 2D plane.

Non-goals:
- No suspension dynamics. Pitch and roll are locked at the Rapier body. R7 unlocks them.
- No tire saturation. R6 (Pacejka) introduces the `μ·F_z` cap; R4's lateral force is the same linear law as R2 (`F_y = -Cα·α`) per axle, just applied at wheel positions.
- No per-wheel slip. R5 (linear-tire) introduces per-wheel slip angles. R4's slip computation stays per-axle and reuses the bicycle math.
- No collision response between vehicle and walls. Terrain is the only collider. There are no walls.
- No drivetrain (differential, gearbox, transfer case). Rear-wheel-drive only; drive force split equally between the two rear wheels.
- No reverse. Continues from R1's open question.

## Decisions

### Decision: Vehicle is a Rapier dynamic rigid body, locked to yaw-only

```
RigidBodyDesc.dynamic()
  .setTranslation(0, ride_height_initial, 0)
  .lockRotations()
  .restrictRotations(false, true, false)  // unlock Y, lock X (pitch) and Z (roll)
```

The Rapier API for selective lock is `setEnabledRotations(x, y, z)`; the vehicle uses `(false, true, false)`. This keeps yaw as an integrated DOF while pitch and roll are constrained to zero. Result: the chassis stays level even under uneven terrain — the cost is that the body never tilts, but suspension dynamics is R7's job.

Collider: a `cuboid(W/2, H/2, L/2)` matching the visible vehicle box, attached to the body. Mass and inertia derive from Rapier's default density unless overridden.

### Decision: Wheel hardpoints

Body-frame positions, relative to the chassis CoG:

```
FL: (-W_track/2, -H_chassis/2, +a)
FR: (+W_track/2, -H_chassis/2, +a)
RL: (-W_track/2, -H_chassis/2, -b)
RR: (+W_track/2, -H_chassis/2, -b)
```

where `a = 1.2 m`, `b = 1.4 m` (matching R2's bicycle), `W_track = 1.5 m`, `H_chassis = 1.0 m` (matching the rendered box). Wheel radius `R_wheel = 0.35 m`.

`-X` is left, `+X` is right (consistent with R1's heading convention: `heading = 0` faces `+Z`, so `+X` is the vehicle's right side).

### Decision: Terrain becomes a Rapier collider

Materialize the heightmap as a Rapier **trimesh** collider built from the same `BufferGeometry` R3 displays. Keeps "what raycast hits" identical to "what the user sees" within a vertex of the rendered mesh. Trimesh colliders are well-supported in `rapier3d-compat` and don't need the heightfield-specific API.

The collider lives on a fixed rigid body, attached at world origin, with the geometry centered there. Built once at bootstrap.

Alternative considered: Rapier `heightfield` collider. Rejected because the rapier3d-compat heightfield API takes a flat `Float32Array` of heights with explicit row/column counts, plus a separate scale, and we'd want the heights to come from the same procedural function the visible mesh uses. Trimesh is closer to "what you see is what you raycast against".

### Decision: Per-wheel raycast direction is world `-Y`

Pitch and roll are locked, so the body's `-Y` is always world `-Y`. We can ray from each wheel hardpoint (in *world* coordinates) downward by some max distance (e.g. `R_wheel + 1.0 m`) and ask Rapier for the first hit.

If Rapier returns a hit within `R_wheel + epsilon` of the hardpoint, the wheel has contact. The contact distance is the hit distance; the contact normal is the surface normal Rapier returns at the hit point.

### Decision: Quasi-static weight transfer

Per-axle static weight (per the R2 mass distribution `a = 1.2`, `b = 1.4`, `L = a + b = 2.6`):

```
F_z_static_front_axle = m·g · b/L
F_z_static_rear_axle  = m·g · a/L
```

Per-wheel static weight is half the axle weight. Add longitudinal and lateral transfer based on chassis CoG accelerations measured from the body's velocity diffs (or, equivalently, from this step's net applied force divided by mass — same number, less arithmetic):

```
ΔF_z_long = m · a_x · h_cog / L     (rearward at +a_x)
ΔF_z_lat  = m · a_y · h_cog / W     (rightward at +a_y, vehicle frame)

F_z_FL = F_z_static_front_axle/2 - ΔF_z_long/2 - ΔF_z_lat/2
F_z_FR = F_z_static_front_axle/2 - ΔF_z_long/2 + ΔF_z_lat/2
F_z_RL = F_z_static_rear_axle/2  + ΔF_z_long/2 - ΔF_z_lat/2
F_z_RR = F_z_static_rear_axle/2  + ΔF_z_long/2 + ΔF_z_lat/2
```

Sum: `m·g` exactly (transfers cancel pairwise).

`h_cog = 0.5 m` — the height of the chassis CoG above the ground. Used only by the weight-transfer formula, not by the rigid body geometry.

`a_x` and `a_y` are this step's body-frame chassis CoG accelerations. We compute them from net force / mass for the current step *before* applying the forces — so weight transfer is in-step, not lagged. This is consistent because force-vs-acceleration is a known relationship: under throttle `T`, longitudinal force is `T · F_DRIVE - F_drag - F_brake_total`, so `a_x` is computable before the step.

If a wheel's computed `F_z` is negative (transfer exceeds static), the wheel is reported as "lifted" — `contact = false`, `F_z = 0`. R4 doesn't model wheel-lift dynamics beyond zeroing the force.

### Decision: Force application

Longitudinal:
- Drive force: `F_drive = throttle · F_DRIVE`. Split equally between RL and RR (rear-wheel drive). Applied at each rear wheel's contact point in the body's `+Z` direction.
- Brake force: `F_brake = brake · F_BRAKE`. Split equally across all four wheels. Applied opposing motion at each wheel's contact point.
- Drag: `F_drag = dragCoef · vx`. Applied at the CoG in `-vx` direction.

Lateral:
- Per-axle slip angle (same as R2's bicycle): `α_f = atan2(vy + a·r, vxSafe) - δ`, `α_r = atan2(vy - b·r, vxSafe)`.
- Per-axle lateral force: `F_yf = -Cα·α_f`, `F_yr = -Cα·α_r`.
- Applied at the *axle midpoint* (in body frame `(0, 0, +a)` and `(0, 0, -b)`) so the yaw moment matches the bicycle. R5 will move to per-wheel slip angles which give a slightly different yaw moment.

Why: R4's job is per-wheel *contact and load*, not per-wheel slip. Keeping lateral force per-axle minimizes the diff vs. R2 dynamics — the bicycle replay-equivalence intuition still applies.

### Decision: VehicleModel interface unchanged; FourWheelVehicle wires the world in via constructor

```
class FourWheelVehicle implements VehicleModel {
  constructor(deps: { world: RAPIER.World, terrain: Heightmap, params? }, initial?)
  state: FourWheelVehicleState  // extends BicycleVehicleState with wheels block
  step(dt, control): void  // applies forces; does NOT call world.step
  reset(partial?): void
}
```

Crucially, `FourWheelVehicle.step` applies forces but does **not** call `world.step` — the app's existing pattern of stepping physics separately stays:

```
onStep(s):
  control = input.read(s.time)
  vehicle.step(s.dt, control)   // applies forces (or self-integrates for bicycle/kinematic)
  physics.step()                 // bicycle/kinematic: no-op; FourWheel: integrates the body
  v = vehicle.state              // bicycle/kinematic: returned from internal struct;
                                 // FourWheel: read from Rapier body translation/rotation/velocity
  telemetry.push(...)
```

This keeps a clean "apply forces, then integrate" cycle and means the `FixedStepLoop` orchestration is identical across all three vehicle implementations.

### Decision: FourWheelVehicleState extends BicycleVehicleState

```
interface WheelState {
  readonly position: Vec3      // world frame, current frame
  readonly contact: boolean
  readonly contactDistance: number  // 0 if no contact
  readonly fz: number          // 0 if no contact
}

interface FourWheelVehicleState extends BicycleVehicleState {
  readonly wheels: {
    readonly fl: WheelState
    readonly fr: WheelState
    readonly rl: WheelState
    readonly rr: WheelState
  }
}
```

### Decision: Telemetry adds `fz_fl, fz_fr, fz_rl, fz_rr`

Stable alphabetical ordering after R0/R1/R2/R3 fields. New CSV header (when the running app produces records):

```
t,step,fz_fl,fz_fr,fz_rl,fz_rr,heading,slip_f,slip_r,speed,vx,vy,x,yaw_rate,z
```

Per-wheel contact booleans and contact distances are NOT in telemetry — they're test-time concerns; the telemetry priority is downstream rung consumers (R6's `μ·F_z`).

## Risks

- **Trimesh collider performance.** The terrain mesh has `128² · 2 = 32 768` triangles. Rapier's broad-phase plus narrow-phase against four wheel raycasts per step at 240 Hz = ~31 k raycasts/second. Should be well within Rapier WASM's capacity, but worth monitoring; if it becomes a bottleneck we'd switch to the heightfield collider variant.
- **Cross-platform Rapier determinism.** R0's design doc warned that "enhanced determinism" is cross-run, not cross-version. R4's replay test asserts cross-run on the same lockfile. Cross-machine determinism is a property of the compiled WASM — known good for the same `package-lock.json`.
- **Rapier API surface for raycast.** `world.castRay` / `castRayAndGetNormal` is the obvious API; we use `castRayAndGetNormal` to get the surface normal too. Rapier's API has shifted across versions; an interpretation may be needed at impl time if `0.19.3`'s exact name differs from documented references.

## Open questions

- Should drag be applied at the CoG or distributed across wheels? *Defer — R4 applies drag at CoG (matches R2). R7 may revisit if suspension makes wheel-applied drag visibly different.*
- Should `state.heading` be defined as Rapier's body yaw angle (extracted from quaternion) or kept as a self-tracked scalar that increments by `r·dt`? *Use Rapier's yaw — single source of truth, no risk of self-tracked drift.*
- Should reverse be enabled now that drive force comes from the rear wheels and could in principle push backward? *No — keep `vx ≥ 0` clamp via brake-only-decelerates rule. R5 / R6 may revisit when load transfer's effect on regenerative-braking-style rear-only braking matters.*
