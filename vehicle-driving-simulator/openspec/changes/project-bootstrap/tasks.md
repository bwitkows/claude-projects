# Tasks — project-bootstrap

## 1. Scaffolding
- [ ] 1.1 Initialize Vite + TypeScript project (`package.json`, `tsconfig.json` with `strict: true`, `vite.config.ts`)
- [ ] 1.2 Add `index.html` with a `<div id="app">` mount point
- [ ] 1.3 Add `biome.json` with sensible defaults; configure as both linter and formatter
- [ ] 1.4 Configure `package.json` scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `e2e`
- [ ] 1.5 Pin all dependency versions exactly (no `^` or `~` anywhere in `package.json`)

## 2. Simulation core (`src/sim/`)
- [ ] 2.1 Implement monotonic sim clock; SHALL NOT use `Date.now`
- [ ] 2.2 Implement fixed-timestep accumulator loop at 240 Hz
- [ ] 2.3 Define `SimStep` event interface; loop emits exactly one per fixed step
- [ ] 2.4 Expose `step()`, `stepN(n)`, and `run()` APIs
- [ ] 2.5 Vitest: accumulator behavior under varying real-time inputs (catch-up, no-skip)
- [ ] 2.6 Vitest: replay equivalence — identical input sequence yields identical body transforms within 1e-8

## 3. Physics (`src/physics/`)
- [ ] 3.1 Add `@dimforge/rapier3d-compat` (exact version pin)
- [ ] 3.2 Wrap Rapier world creation; enable enhanced-determinism mode
- [ ] 3.3 Add ground-plane collider (infinite or large finite plane)
- [ ] 3.4 Provide `step(dt)` driven by sim core only — render must not call this
- [ ] 3.5 Headless determinism test runs in Vitest under node (no DOM)

## 4. Rendering (`src/render/`)
- [ ] 4.1 Initialize Three.js scene, perspective camera (default position above ground), ambient + directional light
- [ ] 4.2 Render ground plane (PlaneGeometry, simple material distinct from sky)
- [ ] 4.3 Set sky / clear color
- [ ] 4.4 FPS counter as DOM overlay; update at least once per second; text matches `/FPS:\s*\d+/`
- [ ] 4.5 Window resize handler updates camera aspect and renderer size
- [ ] 4.6 Render loop reads physics state from sim core only; SHALL NOT call `world.step`

## 5. Telemetry (`src/telemetry/`)
- [ ] 5.1 Bounded ring buffer; default capacity 144_000
- [ ] 5.2 Record schema includes at minimum `t: number` (sim seconds, float64) and `step: number` (uint64-ish)
- [ ] 5.3 `exportCsv(): string` returns header row + chronological records
- [ ] 5.4 Bind key `T` to trigger CSV download; same export function reachable from tests

## 6. Input (`src/input/`)
- [ ] 6.1 Abstract control event surface: `{ throttle: number, brake: number, steer: number }` updated each tick
- [ ] 6.2 Keyboard adapter: W/S = throttle/brake (0..1), A/D = steer (-1..+1), normalized
- [ ] 6.3 Synthetic input source: replays a recorded `ControlEvent[]` for tests
- [ ] 6.4 Sim core consumes input via the abstract surface; never reads DOM

## 7. CI / smoke
- [ ] 7.1 Add `playwright.config.ts` and one smoke test: page loads, FPS > 30 after 5 s
- [ ] 7.2 Add `.github/workflows/ci.yml`: install → typecheck → lint → test → build → e2e on Ubuntu latest
- [ ] 7.3 CI is green on first push

## 8. Docs
- [ ] 8.1 Repo `README.md` (project purpose, stack, quickstart, rung ladder)
- [ ] 8.2 `MEASUREMENT.md` (eval methodology, `result.json` schema, fairness rules)
- [ ] 8.3 `evals/.gitkeep`

## 9. Verification
- [ ] 9.1 Verify all nine acceptance criteria from `proposal.md` pass locally
- [ ] 9.2 Verify CI is green on first push to a feature branch
- [ ] 9.3 Verify the determinism test runs in <5 s and the smoke test in <60 s
