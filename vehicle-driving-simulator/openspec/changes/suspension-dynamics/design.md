# Design — suspension-dynamics

## Context

R7 is the rung that turns the chassis from a kinematic-position-locked plate into a real sprung mass. The change ripples through several R4 design choices and undoes them deliberately:

- **Y translation lock** (`setEnabledTranslations(true, false, true, true)`) → unlocked.
- **pitch and roll lock** (`setEnabledRotations(false, true, false, true)`) → unlocked.
- **gravity scale 0** (so we could manage Y manually) → re-enabled at scale 1.
- **manual `setTranslation` of body Y each step** → removed; Rapier integrates Y from spring + gravity forces.
- **quasi-static `F_z` formula** → replaced by spring + damper force per wheel.

The TireModel interface, per-wheel raycast, force application at wheel contact points, and chassis-cuboid-as-mass-only (no collider) all stay from R4–R6.

## Goals / non-goals

Goals:
- Per-wheel spring/damper that produces the right vertical force to support the chassis at rest (`Σ F_spring = m·g`).
- Visible **pitch under acceleration / braking** and **roll under cornering** — both with magnitudes bounded so the chassis doesn't tip over in normal driving.
- Determinism preserved at `1e-8` (Rapier 6-DOF rigid body integration is deterministic given the same forces; springs are pure functions of compression and compression rate).
- Backward-compatible R4–R6 tests (they assert relative orderings, not absolute values).

Non-goals:
- No anti-roll bar (sway bar) modeling. Each wheel's spring is independent.
- No suspension geometry beyond compression length — no swingarm, no MacPherson strut kinematics.
- No tire vertical compliance. Tire is rigid; only the suspension spring deflects.
- No bump stops (nonlinear spring behavior at full compression / extension). Linear k throughout.
- No camber-on-compression coupling. Suspension geometry is "skyhook" — wheel always points body-Y-down.

## Decisions

### Decision: Spring + linear damper per wheel

Force at each wheel contact point in world `+Y`:

```
x  = max(0, L_0 − raycast_distance)
dx = (x − x_prev) / dt
F_spring = max(0, k·x + c·dx)
```

`max(0, …)` clamps to non-tensile (springs only push up; lifted wheels don't pull down). `c·dx` is the damper term — opposes compression rate. Together they look like a critically-damped-ish ride at the chosen defaults.

### Decision: Default suspension parameters

```
L_0       = 0.40 m   (rest length)
k         = 70_000 N/m   (per wheel — total 280 kN/m)
c         = 5_000 N·s/m  (per wheel — ~50% of critical damping)
```

Per-wheel static load = `m·g/4 = 3679 N`.
Static compression = `(m·g/4) / k = 3679/70000 = 0.0526 m` (5.26 cm).
Natural frequency per wheel ≈ `(1/(2π))·√(k/(m/4)) = (1/(2π))·√(70000/375) ≈ 2.17 Hz`.
Critical damping per wheel ≈ `2·√(k·m/4) = 2·√(70000·375) ≈ 10246 N·s/m`.
With `c = 5000`, damping ratio ≈ 0.49 — slightly underdamped, gives a small visible "settle" oscillation rather than a dead landing.

### Decision: Initial pose at equilibrium

R4–R6 placed body Y at `terrain.heightAt + 0.5`. R7 places body Y at the suspension equilibrium:

```
y_eq = terrain.heightAt(x, z)
     + R_wheel        // wheel center above ground
     + L_0            // wheel hardpoint above wheel center
     − x_rest         // wheel hardpoint compresses down by static load
     + chassis_half_height   // chassis center above wheel hardpoint
```

With the defaults: `0 + 0.35 + 0.40 − 0.0526 + 0.5 = 1.197 m`. Body sits ~70 cm higher than R6 (which was at 0.5 m). The visible chassis box appears further off the terrain — the visual gap is the suspension travel + wheel radius, which is physically correct.

### Decision: Wheel hardpoint stays at body-frame `(±W/2, −H_chassis/2, ±a or −b)`

Same as R4. The hardpoint is the spring's *top* attachment to the chassis; the wheel hangs below by `L_0 − x`, contacts ground a further `R_wheel` below.

Raycast origin is the wheel hardpoint (in world frame after rotating body offsets); direction is world `−Y` (pitch and roll are small, so body `−Y` ≈ world `−Y` for ray casting purposes — this is the same approximation R4 made).

### Decision: Rapier handles 6-DOF integration; we apply forces only

Once translations and rotations are unlocked and gravity is enabled, the body integrates 6 DOF naturally. We apply forces at points (drive, brake, lateral, spring) and Rapier does the rest. **Crucially, we do not call `setTranslation` or `setRotation` per step anymore** — that would override Rapier's solver. The per-step update reduces to:

1. `resetForces`, `resetTorques`.
2. Per-wheel raycast (using current body translation + rotated hardpoint offsets).
3. Per-wheel compression + compression velocity.
4. Per-wheel spring force, applied at the wheel's contact point (or the hardpoint when not in contact — wheel-in-air spring extends harmlessly).
5. Per-wheel slip angle (yaw-only body-frame approximation, see below).
6. Per-wheel lateral force via tireModel, applied at contact point.
7. Drive / brake / drag force application (unchanged from R5/R6).
8. Forward-only `vx ≥ 0` clamp (unchanged).

### Decision: Yaw-only body-frame velocity approximation for slip

With pitch/roll unlocked, the body's local frame is no longer aligned with the world's XZ plane. Strictly correct slip-angle computation would project velocity onto the body's full local frame, then onto the wheel's tilted plane.

R7 keeps the **yaw-only approximation**: extract yaw `h` from the quaternion (treating qx, qz as zero), use the same body-frame velocity formulas as R5/R6:

```
vx_body = lin.x · sin(h) + lin.z · cos(h)
vy_body = lin.x · cos(h) − lin.z · sin(h)
yawRate = world_angvel · ŷ_world  (≈ −ang.y, same as R6)
```

This is exact when pitch and roll are zero. With small pitch/roll (typical driving stays under ~5°), the projection error is `cos(roll) − 1 ≈ −0.4%` at 5° roll, smaller for typical driving. Acceptable.

### Decision: WheelState gains `compression`

```ts
interface WheelState {
  position: Vec3;
  contact: boolean;
  contactDistance: number;
  fz: number;        // F_spring at this wheel (R7: dynamic, was quasi-static)
  slip: number;      // R5
  compression: number;   // R7 — current spring compression in meters
}
```

`fz` interpretation changes from "quasi-static load-transfer formula" to "spring force at this wheel". Magnitude at rest is the same; transient response now oscillates per the spring dynamics.

### Decision: Telemetry adds `c_fl, c_fr, c_rl, c_rr` (compression per wheel)

CSV header at R7 (alphabetical extras after `t, step`):

```
t, step,
c_fl, c_fr, c_rl, c_rr,
fz_fl, fz_fr, fz_rl, fz_rr,
heading, slip_f, slip_r, speed, vx, vy, x, yaw_rate, z
```

Per-wheel slip stays out of CSV (available via state.wheels.<id>.slip). Per-wheel compression goes in because suspension travel is the headline R7 quantity.

### Decision: `compression_prev` stored on the vehicle for `dx/dt`

Damper force needs `dx/dt`. Since we have a fixed timestep `SIM_DT = 1/240 s`, we use one-step backward difference:

```
dx_dt = (x_now − x_prev) / SIM_DT
```

`x_prev` lives on the vehicle as `prevCompression: { fl, fr, rl, rr }` and is updated at the end of each step. On the very first step, `x_prev = 0` for all wheels (springs are uncompressed initially before equilibrium settles in). This produces a small initial transient as the vehicle settles onto its springs from `x = 0` to `x ≈ x_rest`. Acceptable — the test "at rest on level terrain, ΣF_spring = m·g within 1 N" is checked after a settling period (~0.5 s).

## Risks

- **Body settling oscillation on first step.** The damper attenuates the initial transient quickly (settling time ~0.5 s), but tests that check "ΣF_spring at rest ≈ m·g" need to step through the settling first. Documented in tests.
- **Replay equivalence with 6-DOF Rapier.** Adding 3 more integrated DOFs increases the surface area for non-determinism. Rapier's single-threaded WASM solver is documented as deterministic for cross-run replay; no reason to expect this changes at 6 DOF, but the replay test should be more sensitive than R4/R5/R6's. Tightening the tolerance to `5e-8` if needed (still well under `1e-7`) is on the table.
- **Pitch / roll instability.** With springs at `k = 70_000 N/m` per wheel and yaw inertia `Iz = 2500`, the pitch / roll natural frequency is roughly `(1/(2π))·√(k·track²/Iz) ≈ 1.3 Hz`. Damping ratio similarly ~0.5. Should be stable. If sustained input drives pitch/roll past ~10°, the yaw-only velocity approximation degrades — out of scope for R7.
- **Quasi-static `F_z` removal.** R4/R5/R6 tests assert `fz_rear + fz_front ≈ m·g` after settling. R7's spring dynamics produce the same total at equilibrium but oscillates transiently. Tests should sample after a settling window or relax tolerances.

## Open questions

- Should pitch / roll have their own damping (anti-roll bar, anti-dive geometry)? *Out of scope.* R7 keeps independent springs. Anti-roll could be a follow-up rung.
- Should bump stops (nonlinear k at high compression) be added to prevent the chassis from "bottoming out" on big terrain features? *Defer.* The default heightmap is gentle (~6 m amplitude over 60 m wavelengths); the chassis doesn't bottom out on it.
