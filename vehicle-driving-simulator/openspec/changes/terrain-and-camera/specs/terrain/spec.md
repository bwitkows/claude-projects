# terrain (delta)

## ADDED Requirements

### Requirement: Procedural heightmap

The system SHALL provide a `Heightmap` whose `heightAt(x: number, z: number) => number` returns a deterministic height at any world-space coordinate. Heights SHALL be a continuous function of position (no step discontinuities) and SHALL be bounded — at default parameters, `|heightAt(x, z)| ≤ 6 m` everywhere.

The default heightmap SHALL be defined by a closed-form sum-of-sines function, not by random noise — so that two runs on different machines using the same dependency lockfile produce identical heights.

#### Scenario: heightAt is a pure function

- WHEN `heightAt(x, z)` is called twice with identical `x` and `z`
- THEN both calls SHALL return identical values

#### Scenario: heightAt is bounded

- GIVEN the default heightmap parameters
- WHEN `heightAt(x, z)` is sampled at any `(x, z)` in `[-100, 100] × [-100, 100]`
- THEN the result SHALL satisfy `|height| ≤ 6 m`

### Requirement: Surface normal accessor

The heightmap SHALL provide `normalAt(x: number, z: number) => { x, y, z }` returning a unit-length vector approximating the upward surface normal at that point. R3 does not consume this for rendering, but it ships the API so R4's per-wheel raycast can use the same source of truth without an interface change.

#### Scenario: normalAt is a unit vector

- WHEN `normalAt(x, z)` is called at any `(x, z)`
- THEN `sqrt(n.x² + n.y² + n.z²)` SHALL equal 1 within `1e-12`

#### Scenario: normalAt agrees with heightAt's analytic derivative

- WHEN `heightAt` and `normalAt` are evaluated at the same point
- THEN `normalAt` SHALL be the unit vector corresponding to `cross([1, ∂h/∂x, 0], [0, ∂h/∂z, 1])` — the closed-form normal derived from the same procedural function

### Requirement: Mesh generation

The system SHALL provide a `buildTerrainGeometry(heightmap, opts?)` function returning a Three.js `BufferGeometry` representing the heightmap over a finite square (default: `200 × 200 m` centered on the origin, `128 × 128` cells).

#### Scenario: Mesh has expected vertex and index count

- GIVEN `segments = 128`
- WHEN `buildTerrainGeometry` is called
- THEN the geometry SHALL contain `(segments + 1)²` vertex positions
- AND the geometry SHALL contain `segments² * 2 * 3` triangle index entries

#### Scenario: All mesh positions are finite

- WHEN the mesh is built from the default heightmap
- THEN no vertex position component SHALL be `NaN` or `±Infinity`
