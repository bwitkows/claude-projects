# Design — project-bootstrap

## Context

R0 is the only change explicitly designed to be a foundation, not a feature. Decisions made here propagate through every later rung (kinematic vehicle through Pacejka tire model). The two non-negotiables are:

- **Determinism.** Replay-equivalence for identical input sequences is what makes later rungs comparable across AI tool runs. If R0 is not deterministic, every later eval is corrupted.
- **Modularity.** The vehicle model will be swapped at least four times across the rung ladder. The simulation core must not know which model is running, and no module may reach into another's internals.

## Goals / non-goals

Goals:
- Deterministic, fixed-timestep simulation core decoupled from rendering.
- Clean module boundaries: `sim/`, `physics/`, `render/`, `telemetry/`, `input/`. None imports another's internals.
- Headless physics: anything not requiring a DOM SHALL run in node so Vitest can exercise it.

Non-goals:
- No vehicle in R0. R1 introduces the `VehicleModel` interface and a kinematic implementation.
- No terrain, no chase camera, no audio, no menus, no multiplayer.
- No tire model, no suspension. Those are R5–R7.
- No rng. R0 has no stochastic behavior; R8 (replay) introduces a seeded rng if needed.

## Decisions

### Decision: Fixed-timestep accumulator at 240 Hz

```
loop():
  acc += now() - last
  while acc >= STEP (1/240 s):
      world.step(STEP)
      tickTelemetry()
      acc -= STEP
  render()
```

Why 240 Hz: vehicle dynamics with stiff suspension and high lateral accelerations at speed are unstable below ~120 Hz with semi-implicit Euler; 240 Hz gives headroom for the harder rungs without re-architecting. CPU cost on modern hardware is negligible.

Alternatives rejected:
- Variable timestep — non-deterministic, kills replay.
- 60 Hz lockstep with rAF — insufficient headroom for sim-grade dynamics later; would require migration in R5–R7.

### Decision: Rapier (`rapier3d-compat`) for rigid body, custom code for vehicle

Rapier provides the rigid body integrator and collision pipeline. Even at high rungs we keep using Rapier for the body. The vehicle dynamics layer runs on top of Rapier rigid bodies via applied forces and torques; we do not rely on Rapier's `DynamicRayCastVehicleController` past the toy stage.

Why `rapier3d-compat`: works in both browser and node without an async init dance, so determinism tests can run headlessly under Vitest.

Why enhanced-determinism mode: required for cross-platform replay; small perf cost, large eval payoff.

### Decision: Telemetry as ring buffer + CSV export

Telemetry writes one record per simulation step, not per render frame. Buffer is bounded (default capacity ~10 minutes at 240 Hz = 144,000 records); oldest dropped on overflow. Export hook serializes a snapshot of the buffer to CSV synchronously.

Replay (R8) will record the input stream and replay it through the deterministic core, not record state. R0 establishes the per-step record, not the replay machinery.

### Decision: Module layout

```
src/
  sim/         simulation-core (loop, clock, deterministic step API)
  physics/     Rapier wrapper, world, body factories
  render/      Three.js scene, camera, lights, ground, FPS overlay
  telemetry/   ring buffer, recorder, CSV exporter
  input/       keyboard adapter, synthetic source, control event emitter
  app/         composition root; wires modules together
  main.ts      entry point, mounts to #app
```

Each module exports a small typed surface. Tests live next to source as `*.test.ts`. The `app/` module is the only place that knows about more than one capability.

### Decision: Versioning policy

Pin all dependencies to exact versions in `package.json`. No `^` or `~`. Eval reproducibility requires the toolchain to be deterministic — a silent minor bump in Rapier could change physics behavior.

## Risks

- **Rapier "enhanced determinism" is cross-run, not cross-version.** Document in `MEASUREMENT.md` that physics dependency upgrades may shift recorded telemetry; eval comparisons must be within the same `package-lock.json`.
- **Bundle size budget.** Rapier WASM ≈ 2 MB, Three.js ≈ 600 KB gzipped. Acceptable for R0; revisit as a budget gate if it grows past ~5 MB total.
- **Playwright on Windows runners is slower than Linux.** Mitigated by running CI on Linux runners only.

## Open questions

- Should sim-core expose a stepN(n) helper for tests, or only single-step? — Default to both.
- Should telemetry default capacity be configurable from the URL? — Defer until R8.
