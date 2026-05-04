# project-bootstrap

## Why

This repository serves a dual purpose:

1. Build a high-fidelity 3D vehicle driving simulator that runs in the browser.
2. Function as a benchmark for evaluating AI coding tools — each rung of vehicle dynamics fidelity is delivered as one OpenSpec change executed by an AI tool, with measurable success criteria captured under `evals/`.

R0 establishes the foundation everything later depends on: a deterministic simulation loop, a rendering harness, a telemetry primitive that supports replay, a structured input surface, and CI. Until these exist, no later rung can produce comparable evaluation data.

## What Changes

- Initialize a Vite + TypeScript (strict) project skeleton with exact-pinned dependencies.
- Add Three.js for rendering and Rapier (`@dimforge/rapier3d-compat`) for physics.
- Add a fixed-timestep simulation loop running at 240 Hz, decoupled from `requestAnimationFrame`.
- Configure Rapier in enhanced-determinism mode and expose a deterministic step API.
- Add a structured telemetry buffer (per-step records, monotonic time-indexed) with a CSV export hook.
- Add a keyboard input adapter that emits abstract control events (`throttle`, `brake`, `steer`) and a synthetic input source for tests.
- Add Vitest with a determinism unit test (replay same input → identical state).
- Add Playwright with a smoke test (page boots, FPS > 30 after 5 seconds).
- Add Biome for lint + format.
- Add GitHub Actions CI (typecheck, lint, vitest, build, playwright).
- Establish four capabilities: `simulation-core`, `rendering`, `telemetry`, `input`.

## Impact

- Affected specs: NEW `simulation-core`, `rendering`, `telemetry`, `input`
- Affected code: ALL — initial repository
- BREAKING: N/A (greenfield)

## Acceptance criteria

This change is considered passed when ALL of the following hold at the resulting commit:

1. `npm install` completes successfully on a clean clone.
2. `npm run typecheck` exits 0 with `strict: true` in `tsconfig.json`.
3. `npm run lint` (Biome) exits 0.
4. `npm test` (Vitest) exits 0; the suite includes the determinism test required by `simulation-core`.
5. `npm run build` produces a single HTML entry that loads a WASM module and a JS bundle.
6. `npm run e2e` (Playwright) passes the smoke test required by `rendering`.
7. The CI workflow at `.github/workflows/ci.yml` runs all of the above on push.
8. The telemetry CSV export matches the schema documented in the `telemetry` spec.
9. All dependency versions in `package.json` are pinned exactly (no `^` or `~`).

A run is **partially passed** if (1)–(5) hold but (6)–(9) do not. Tag clearly in `evals/<rung>/<tool>/<attempt-id>/result.json`.
