# vehicle (delta)

## ADDED Requirements

### Requirement: Per-wheel spring/damper

`FourWheelVehicle` SHALL maintain per-wheel suspension parameters (rest length `L_0`, stiffness `k`, damping `c`) and compute a vertical spring force at each wheel each step:

```
compression = max(0, L_0 − raycast_distance)
dx_dt       = (compression − prev_compression) / dt
F_spring    = max(0, k · compression + c · dx_dt)
```

The force SHALL be applied at the wheel's world contact point in world `+Y` direction.

`F_z_wheel` SHALL equal `F_spring` for that wheel (replacing R4/R5/R6's quasi-static formula). The TireModel continues to consume `F_z` without modification.

#### Scenario: ΣF_spring at rest equals m·g within 1 N

- GIVEN a `FourWheelVehicle` constructed at suspension equilibrium on level terrain
- WHEN the vehicle is stepped with neutral controls for 240 sim steps (1 simulated second, well past the settling oscillation)
- THEN `Σ F_spring` over the four wheels SHALL equal `m · g` within 1 N

### Requirement: Chassis Y, pitch, and roll are unlocked

The chassis rigid body SHALL have all three translational degrees of freedom enabled (`setEnabledTranslations(true, true, true, true)`) and all three rotational degrees of freedom enabled (`setEnabledRotations(true, true, true, true)`).

Gravity SHALL be enabled at scale 1 on the chassis body (`setGravityScale(1, true)`). Spring forces balance gravity at the equilibrium pose.

#### Scenario: Body translates vertically when spring forces change

- GIVEN a `FourWheelVehicle` settled at equilibrium
- WHEN the vehicle is moved (via simulation) over terrain with a sudden 0.3 m height bump
- THEN the chassis Y SHALL respond — increase momentarily as it climbs the bump, decrease back to the new equilibrium
- AND the body SHALL NOT pass through the terrain at any point

### Requirement: Initial pose at suspension equilibrium

The body's initial Y position SHALL satisfy:

```
y_init = terrain.heightAt(x_init, z_init)
       + wheelRadius
       + springRestLength
       − (m · g) / (4 · springStiffness)
       + chassisHeight / 2
```

so the springs are pre-compressed to their static-load value at `t = 0` and the body does not "fall" onto the suspension at startup.

#### Scenario: Initial pose places ΣF_spring near m·g without long settling

- WHEN a `FourWheelVehicle` is constructed and stepped once with neutral controls
- THEN `|Σ F_spring − m · g|` SHALL be less than 5 N at the first step (small deviation acceptable since prev_compression = 0 makes dx/dt non-zero on the first step)

### Requirement: Pitch under throttle / brake; roll under cornering

The chassis SHALL pitch (rotation around body +X axis) under longitudinal acceleration and roll (rotation around body +Z axis) under lateral acceleration, both as natural consequences of forces applied at wheel contact points.

#### Scenario: Throttle squats the rear

- GIVEN a `FourWheelVehicle` at rest after settling
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = 0` for 240 sim steps
- THEN `state.wheels.rl.compression + state.wheels.rr.compression` SHALL exceed `state.wheels.fl.compression + state.wheels.fr.compression`
- AND the chassis pitch angle (read from the body's quaternion) SHALL have magnitude > 0.005 rad

#### Scenario: Brake dives the front

- GIVEN a `FourWheelVehicle` driven up to `vx > 5 m/s`
- WHEN the vehicle is stepped with `throttle = 0, brake = 1, steer = 0` for 120 sim steps
- THEN `state.wheels.fl.compression + state.wheels.fr.compression` SHALL exceed `state.wheels.rl.compression + state.wheels.rr.compression`
- AND the chassis pitch angle SHALL have opposite sign to the throttle case (front-down)

#### Scenario: Cornering rolls outward

- GIVEN a `FourWheelVehicle` accelerated to `vx > V_MAX/2` driving straight
- WHEN the vehicle is stepped with `throttle = 1, brake = 0, steer = 1` for 240 sim steps
- THEN the side opposite the turn (the outside of the turn) SHALL have larger total compression than the inside
- AND the chassis roll angle SHALL have magnitude > 0.005 rad

### Requirement: WheelState compression field

`WheelState` SHALL include a `compression: number` field (meters) that reflects the per-wheel spring compression as of the most recent step.

#### Scenario: Compression populated after step

- WHEN `FourWheelVehicle.step` returns
- THEN `state.wheels.fl.compression`, `.fr.compression`, `.rl.compression`, `.rr.compression` SHALL all be finite, non-negative numbers

### Requirement: Determinism preserved with 6-DOF integration

Two independent `FourWheelVehicle` instances with identical Rapier worlds and identical input sequences SHALL produce identical state field-by-field within `1e-8` for body state and `1e-6` for per-wheel `fz`, `slip`, `compression` over 240 sim steps.

#### Scenario: Replay equivalence with suspension

- GIVEN two parallel harnesses with identical setup
- AND a `SyntheticInputSource` providing 240 control events that exercise throttle, brake, steer
- WHEN both are stepped through the same sequence
- THEN every numeric field of `state` SHALL match within `1e-8`
- AND each `state.wheels.<id>.{fz, slip, compression}` SHALL match within `1e-6`

### Requirement: Telemetry adds per-wheel compression columns

The running app's per-step telemetry record SHALL include `c_fl, c_fr, c_rl, c_rr` populated from `state.wheels.<id>.compression`. CSV header (when buffer non-empty) SHALL be:

```
t,step,c_fl,c_fr,c_rl,c_rr,fz_fl,fz_fr,fz_rl,fz_rr,heading,slip_f,slip_r,speed,vx,vy,x,yaw_rate,z
```

(Alphabetical extras after the base `t, step` fields.)

### Requirement: KinematicVehicle and BicycleVehicle remain unchanged

R7 SHALL NOT modify `BicycleVehicle` or `KinematicVehicle` source. Their R1/R2 tests pass byte-for-byte unchanged.

#### Scenario: Prior vehicles still importable

- WHEN tests import `KinematicVehicle` or `BicycleVehicle`
- THEN the imports SHALL succeed
- AND constructing each and stepping it SHALL produce R1/R2-equivalent results
