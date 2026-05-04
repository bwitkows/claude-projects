# claude-projects

A collection of projects designed as benchmarks for evaluating AI coding tools (Claude Code, Cursor, Cline, Codex, etc.). Each subdirectory is one project; each is structured so the same task can be handed to multiple tools and the results compared objectively.

See the per-project README for project-specific details and the per-project `MEASUREMENT.md` for evaluation methodology.

## Projects

| Directory | Description |
|-----------|-------------|
| [`vehicle-driving-simulator/`](./vehicle-driving-simulator/) | A high-fidelity 3D vehicle driving simulator built incrementally as an AI-eval ladder (kinematic → bicycle → 4-wheel → Pacejka tire models). Three.js + Rapier + TypeScript, browser-native. |

## Methodology (general)

Each project ships its own `MEASUREMENT.md` defining what counts as pass/fail, what artifacts are captured per run, and fairness rules. The methodology may differ per project but follows a common shape: discrete OpenSpec changes as work units, deterministic baselines, math-based or otherwise objective acceptance criteria, structured per-run artifacts under `evals/`.

## Branching

`main` advances only when work has passed its eval criteria. `dev` is where AI agents run; reset to `main` between tool comparisons so each tool starts from the same baseline.

A worktree of `dev` lives at `../projects-dev/` (sibling of this repo's main worktree).
