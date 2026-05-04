# Measurement methodology

This repository evaluates AI coding tools by handing each tool one OpenSpec change ("rung") and recording how the run goes. The output of every evaluation is a directory under `evals/`.

## Per-run artifacts

`evals/<rung>/<tool>/<attempt-id>/`:

- `prompt.md` — the exact prompt or invocation given to the tool. Reference the OpenSpec change rather than copy-pasting it; include any extra system instructions or persona.
- `transcript.md` — full session transcript or log if the tool exposes one.
- `diff.patch` — `git diff` from the rung's baseline commit to the resulting commit.
- `result.json` — structured pass/fail data (schema below).
- `notes.md` — qualitative observations: what surprised you, where the tool struggled, judgment calls.

## What "passed" means

Each rung's `proposal.md` defines its own acceptance criteria. A run is **passed** iff *all* of the following hold at the resulting commit:

1. `npm run typecheck` exits 0
2. `npm run lint` exits 0
3. `npm test` exits 0
4. `npm run e2e` exits 0
5. `npm run build` exits 0
6. The rung's specific acceptance assertions in `proposal.md` are met (typically a math-based determinism or telemetry assertion)

A run is **partially passed** iff (1)–(5) hold but (6) does not. Don't conflate the two.

## `result.json` schema

```json
{
  "rung": "R0",
  "change": "project-bootstrap",
  "tool": "claude-code-1.0.x",
  "attemptId": "2026-05-04-a",
  "startedAt": "2026-05-04T12:00:00Z",
  "endedAt": "2026-05-04T13:24:00Z",
  "wallClockSeconds": 5040,
  "humanInterventions": 0,
  "checks": {
    "typecheck": "pass",
    "lint": "pass",
    "test": "pass",
    "e2e": "pass",
    "build": "pass",
    "rungSpecific": "pass"
  },
  "outcome": "passed",
  "linesAdded": 1234,
  "linesRemoved": 0,
  "filesTouched": 42
}
```

## Rules for a fair comparison

- **Same baseline.** Each tool starts from the same git commit (the prior rung's archived commit). No prior state from other tools.
- **Same prompt.** The rung's OpenSpec change *is* the prompt. Tool-specific framing (system prompt, persona) is allowed but documented in `prompt.md`.
- **Bounded human intervention.** Count and record any human nudges in `humanInterventions`. Zero is the gold standard; non-zero runs are still useful but must be tagged so they aren't compared against zero-intervention runs.
- **First attempt is primary; retries are allowed but logged separately.** The first attempt is the headline result; subsequent attempts get distinct `attempt-id`s.
- **No tweaking the spec mid-run.** If the spec is ambiguous, that's an *eval finding*, not a reason to edit the spec — note it and continue. Update specs only between rungs.
- **Same lockfile.** Compare runs only within the same `package-lock.json`. A dependency upgrade may shift physics behavior; record the lockfile hash in `result.json` if cross-lockfile comparison is unavoidable.

## What this experiment is NOT

- Not a leaderboard. The goal is to characterize *failure modes* and *capability boundaries*, not crown a winner.
- Not statistically rigorous. Sample sizes are small. Treat findings as case studies.
- Not a substitute for your own judgment about which tool fits which task.

## How to read the results

After several rungs:

- Aggregate `result.json` across runs into a comparison sheet by tool.
- Read `notes.md` files looking for patterns — does Tool X consistently struggle with determinism? Does Tool Y over-engineer? Does Tool Z silently skip e2e tests?
- The signal is not "X% pass rate" — it's the *shape* of where each tool succeeds and fails.
