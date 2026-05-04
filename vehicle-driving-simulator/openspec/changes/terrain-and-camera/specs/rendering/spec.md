# rendering (delta)

## ADDED Requirements

### Requirement: Chase camera follows the vehicle

The renderer SHALL provide a chase camera that follows the vehicle from a fixed body-frame offset and looks toward a body-frame target slightly ahead of the vehicle. The camera's position and look-at point SHALL converge toward their desired values via exponential decay each render frame.

#### Scenario: At steady state with vehicle stationary, camera offset matches the configured body-frame offset

- GIVEN a chase camera with body-frame offset `(0, 4, -8)`
- AND a vehicle stationary at the world origin with `heading = 0`
- WHEN the camera is stepped repeatedly with realistic render `dt` for several seconds
- THEN the camera's world-space position SHALL converge to within `1e-6` of `(0, 4, -8)`

#### Scenario: Camera body-frame offset is preserved as the vehicle rotates

- GIVEN a steady-state chase camera following a stationary vehicle at `heading = 0`
- WHEN the vehicle's heading changes to `π/2` and the camera is run to steady state
- THEN the camera position relative to the vehicle, expressed in body frame (de-rotated by the new heading), SHALL still equal the configured body-frame offset within `1e-6`

#### Scenario: Camera does not advance physics

- WHEN the chase camera is stepped to follow the vehicle
- THEN no call to `world.step` SHALL originate from the camera
- AND no call to `vehicle.step` SHALL originate from the camera
- AND vehicle state SHALL be read but not written

### Requirement: Vehicle Y is sourced from terrain at render time

The renderer SHALL place the vehicle mesh at world-space `y = terrain.heightAt(state.x, state.z) + RIDE_HEIGHT` each frame, where `RIDE_HEIGHT` is the renderer-managed offset from terrain to the vehicle's mesh origin.

The vehicle's logical state (`x, z, heading, speed`, plus the bicycle-only `vx, vy, yawRate, slipF, slipR`) SHALL NOT include `y`. Telemetry SHALL NOT include `y`. The replay-equivalence test for `BicycleVehicle` SHALL still pass within `1e-8`.

#### Scenario: Vehicle visually rides on terrain

- GIVEN the vehicle is at `(x = 30, z = -20)`
- WHEN a render frame is composed
- THEN the vehicle mesh's world-space `y` SHALL equal `terrain.heightAt(30, -20) + RIDE_HEIGHT` within `1e-9`

### Requirement: Terrain mesh is the visible ground

The R0 flat ground plane SHALL be replaced by a Three.js mesh built from the heightmap (`buildTerrainGeometry`). The terrain mesh SHALL be visible in the scene whenever the chase camera is looking toward the world origin region.

#### Scenario: Scene contains the terrain mesh

- WHEN the scene is constructed via `createScene`
- THEN the scene's children SHALL include the terrain mesh built from the heightmap
- AND the scene SHALL NOT contain a flat ground plane separate from the terrain mesh

## MODIFIED Requirements

### Requirement: Three.js scene foundation (was R0)

The system SHALL render a Three.js scene with a perspective camera, ambient and directional lighting, **a heightmap-derived terrain mesh** (replaces the R0 flat ground plane), and a sky color distinct from the terrain.

#### Scenario: Scene renders on load

- WHEN the page is loaded
- THEN a non-empty WebGL canvas SHALL be visible at the `#app` mount point
- AND the terrain mesh SHALL be visible from the chase camera's converged position
- AND the sky SHALL be a solid clear color visually distinct from the terrain
