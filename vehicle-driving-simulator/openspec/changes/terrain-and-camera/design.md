# Design — terrain-and-camera

## Context

R3 is the rung where the simulator stops being a programming exercise on a flat plane and starts looking like a driving simulator. The two pieces — terrain and chase camera — are independent in scope but share a constraint: neither may affect determinism. The vehicle's logical state is still 2D in dynamics; everything R3 introduces is render-side or sampler-side, never integrator-side.

## Goals / non-goals

Goals:
- A heightmap that is **deterministic** (no `Math.random`, no platform-specific FP shenanigans), **smooth** (continuous height and normal), and **bounded** (heights stay within a few meters so the vehicle stays visually anchored).
- A chase camera that's smooth enough not to snap, responsive enough that the player feels coupled to the vehicle, and **decoupled from physics** so that the existing replay-equivalence determinism test still passes byte-for-byte.
- A `terrain` API that R4 can use unchanged: `heightAt(x, z)` and `normalAt(x, z)` are the two methods R4's raycast will need.

Non-goals:
- No physical interaction with terrain. The bicycle model still drives in 2D. R4 introduces per-wheel raycasts.
- No collision detection between the vehicle and the heightmap. The vehicle "drapes" over the heightmap visually (its mesh `y` follows `heightAt`), but it can't fall off, can't hit walls, can't stick. There are no walls.
- No biomes, no textures, no skybox change. R3 is geometry.
- No first-person / cockpit / orbit camera. Just one chase camera. Camera selection UI is not in scope.
- No camera collision (clipping through hills). The chase camera is "spring-arm-free"; it will pass through terrain on steep descents. Acceptable for R3.

## Decisions

### Decision: Procedural heightmap, sum of sines

```
height(x, z) = A_LARGE * sin(x / L_LARGE) * cos(z / L_LARGE)
             + A_MED   * sin(x / L_MED + 1.7) * cos(z / L_MED - 0.5)
             + A_SMALL * sin(x / L_SMALL + 2.3) * cos(z / L_SMALL + 1.1)
```

Defaults: `A_LARGE = 4`, `L_LARGE = 60`; `A_MED = 1.5`, `L_MED = 18`; `A_SMALL = 0.4`, `L_SMALL = 6`. Heights are bounded by `4 + 1.5 + 0.4 = 5.9 m` from zero, so the vehicle is never visually buried or floating above its ride height.

Why a sum of sines:
- Pure function of `(x, z)` with no state, no random calls — trivially deterministic and testable.
- Continuous and smooth → analytic gradient → analytic surface normal.
- Cheap: 6 sin/cos evaluations per sample. Vehicle y per frame is <1 µs.

The constants 1.7, -0.5, 2.3, 1.1 are arbitrary phase offsets to break symmetry; they have no physical meaning.

Alternative considered: a precomputed heightmap loaded from a `.png` or `.bin`. Rejected for R3 — it adds a build-time asset and IO concerns. The procedural function gives us infinite world without storage.

### Decision: Bilinear sampler over a triangulated mesh, with closed-form normal

For *rendering*, we sample the procedural function at a 128×128 grid over a 200 × 200 m square centered on the world origin (cell size ~1.56 m), and triangulate it into a Three.js `BufferGeometry`. This is the visible terrain.

For *querying* (`heightAt`, `normalAt`), we evaluate the procedural function directly — not the discretized mesh. This means `heightAt` is consistent with the visible mesh only at the 128×128 vertex points; between vertices, `heightAt` reads the underlying procedural function while the rendered mesh interpolates linearly across the triangle. The disagreement is bounded by the highest-frequency sine wavelength (`L_SMALL = 6 m`) over a cell width (~1.56 m), so worst-case ~1 cm. Acceptable for R3; R4 may want to tighten this for accurate raycasts.

Closed-form normal is the cross product of `∂h/∂x` and `∂h/∂z` partial-derivative tangent vectors, normalized:

```
∂h/∂x = (A_LARGE / L_LARGE) * cos(x / L_LARGE) * cos(z / L_LARGE) + …
∂h/∂z = -(A_LARGE / L_LARGE) * sin(x / L_LARGE) * sin(z / L_LARGE) + …
```

`normalAt(x, z) = normalize(cross([1, ∂h/∂x, 0], [0, ∂h/∂z, 1]))` — yields a unit vector pointing roughly +Y. R3 doesn't *use* normalAt for anything visual; it ships it now so R4's raycast doesn't have to extend the API.

### Decision: Vehicle y is a render concern, not a state concern

`VehicleState` and `BicycleVehicleState` are unchanged. The vehicle's `y` does not appear in any state struct, telemetry record, or replay test.

Per render frame, the app does:

```
vehicle_world_y = terrain.heightAt(vehicle.state.x, vehicle.state.z) + RIDE_HEIGHT
```

and passes that to `scene.updateVehicle({ x, y, z, heading })`. (The renderer's `updateVehicle` API gains a `y` field; defaulting to `RIDE_HEIGHT` if a caller doesn't pass one keeps the API backward-compatible — though only the app calls it.)

`RIDE_HEIGHT = 0.5 m` (half the vehicle box height, matching where the box currently sits in R2).

### Decision: Chase camera math

Body-frame offset (default): position `(0, 4, -8)` (4 m up, 8 m behind, in vehicle body frame at heading=0).
Body-frame look-at point: `(0, 1, 4)` (1 m up, 4 m ahead).

Convert to world frame each render frame:

```
desired_pos    = vehicle_world + R_y(heading) * camera_offset
desired_lookat = vehicle_world + R_y(heading) * lookat_offset
```

Then apply exponential decay toward `desired_*`:

```
alpha = 1 - exp(-CAMERA_DECAY * dt_render)
camera.position.lerpTo(desired_pos, alpha)
camera.lookAt   .lerpTo(desired_lookat, alpha)
```

`CAMERA_DECAY = 6` per second. Half-life ≈ 0.12 s — responsive but not snappy.

`dt_render` here is the wall-clock delta between rAF callbacks. This makes the camera frame-rate-dependent in absolute terms (a 30-fps frame moves the camera twice as far per call as a 60-fps frame), but the `1 - exp(-k*dt)` form is *time-correct* — at any frame rate, the camera approaches its target with the same time constant. Tested in unit tests by calling the camera step function with synthetic dts.

The camera's smoothing is **not** part of replay determinism — it lives in `onRender`, not `onStep`, and uses wall-clock dt. Replay tests that drive the sim through `stepN` never invoke the camera.

### Decision: Module layout

```
src/terrain/
  heightmap.ts       procedural function + sampler + closed-form normal
  mesh.ts            BufferGeometry generator from a Heightmap
  heightmap.test.ts  determinism + closed-form checks
  mesh.test.ts       vertex-count + indexing invariants
  index.ts           barrel

src/render/
  camera.ts          ChaseCamera class (state + step + apply-to-three)
  camera.test.ts     one-step convergence + steady-state offset
  scene.ts           uses Heightmap + ChaseCamera; vehicle y from terrain
```

`src/app/index.ts` constructs a `Heightmap` and a `ChaseCamera`, passes the heightmap to the scene factory, and per render frame: samples vehicle y, updates camera with new vehicle pose + dt, calls scene.render.

## Risks

- **Heightmap visual seam at the world border.** The 200×200 m square has hard edges. If the vehicle drives outside it, the rendered mesh ends, but `heightAt` keeps producing values (the procedural function has no bounds). Visible only if the user drives ~100 m from origin — acceptable for R3.
- **Camera through terrain.** On steep descents the camera will dip below the terrain surface. A spring-arm raycast that lifts the camera above terrain is the standard mitigation; deferred to a later rung if needed.
- **Bilinear-mesh vs. analytic-function disagreement.** ~1 cm worst case at default frequencies — small enough that the vehicle visually riding on the mesh surface vs. the analytic surface is imperceptible. R4's raycast against the *mesh* would give different y values than `heightAt(x, z)` against the *function*. R4 should pick one source of truth and document the choice.

## Open questions

- Should `terrain.heightAt` interpolate the rendered mesh (so the vehicle visually rides exactly on what's drawn) or evaluate the analytic function (so R4 raycasts can use the same source)? *Defer to R4 and pick whichever the raycast prefers.* For R3, both visual and `heightAt` use the analytic function — keeping things consistent within R3.
- Should the chase camera be unit-tested via the `THREE.PerspectiveCamera` instance, or via a pure mathematical helper? *Pure helper — keeps tests DOM-free and fast. The Three.js camera is set from the helper's outputs in the scene module.*
