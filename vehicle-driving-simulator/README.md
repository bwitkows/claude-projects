# Vehicle Driving Simulator (and AI tool benchmark)

A high-fidelity 3D vehicle driving simulator that runs in the browser.

This repository serves a dual purpose:

1. **The simulator.** Three.js + Rapier, TypeScript. The vehicle dynamics climb a fidelity ladder from a kinematic toy through bicycle, four-wheel raycast, linear-tire, Pacejka-tire, and suspension models.
2. **A benchmark for AI coding tools.** Each rung is delivered as one OpenSpec change. The same change can be handed to different AI tools; tests, telemetry, and methodology are designed so runs are objectively comparable.

See `MEASUREMENT.md` for evaluation methodology and `openspec/changes/` for proposed and active changes.

## Stack

- TypeScript (strict)
- Vite
- Three.js (rendering)
- Rapier (`@dimforge/rapier3d-compat`) for rigid body physics, enhanced-determinism mode
- Vitest (unit + integration)
- Playwright (e2e smoke)
- Biome (lint + format)
- GitHub Actions (CI)

All dependency versions are pinned exactly. Eval reproducibility requires the toolchain to be deterministic.

## Quickstart

```
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```
npm run build      # production bundle
npm run typecheck
npm run lint
npm test           # vitest
npm run e2e        # playwright
```

## Rung ladder

| Rung | Change                  | What it adds                                                  |
|------|-------------------------|---------------------------------------------------------------|
| R0   | `project-bootstrap`     | Sim core, rendering, telemetry, input, CI                     |
| R1   | `kinematic-vehicle`     | Box that drives via velocity + steering                       |
| R2   | `bicycle-model`         | Slip-angle dynamics, lateral force                            |
| R3   | `terrain-and-camera`    | Heightmap world, chase camera                                 |
| R4   | `four-wheel-raycast`    | Per-wheel ground contact, weight transfer                     |
| R5   | `linear-tire-model`     | Slip-angle → lateral force in the linear regime               |
| R6   | `pacejka-tire-model`    | Saturating tire forces; controlled drift achievable           |
| R7   | `suspension-dynamics`   | Spring/damper per wheel; pitch and roll observable            |
| R8   | `telemetry-and-replay`  | Deterministic replay; regression tests over recorded runs     |

Each rung adds requirements; it does not throw away earlier code.

## Project layout

```
src/
  sim/         simulation-core (loop, clock, deterministic step API)
  physics/     Rapier wrapper, world, body factories
  vehicle/     vehicle dynamics (introduced in R1; swappable models)
  render/      Three.js scene, camera, lights, ground, FPS overlay
  telemetry/   ring buffer, recorder, CSV exporter
  input/       keyboard adapter, synthetic source, control event emitter
  app/         composition root; only place that wires multiple modules
  main.ts      entry point

openspec/
  changes/     proposed and active changes (each rung)
  specs/       long-lived capability specs (populated on archive)

evals/         per-rung-per-tool evaluation artifacts (see MEASUREMENT.md)
```
