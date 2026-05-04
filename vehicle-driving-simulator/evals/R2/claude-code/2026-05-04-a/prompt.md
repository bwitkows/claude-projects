# Prompt — R2 / claude-code / 2026-05-04-a

## Tool

Claude Code (CLI), model `claude-opus-4-7[1m]` (Opus 4.7, 1M context).

## System / persona

Default Claude Code system prompt + `vehicle-driving-simulator/AGENT_POLICY.md` as the operating contract.

Same caveat as R1: the agent who *wrote* the R2 spec is the same agent *implementing* R2 in a single continuous session. The spec was tagged at `r2-baseline` (`8b838fa`) before implementation began and was not edited during implementation — but the spec author's understanding of the implementation reality is unavoidably entangled. Future tools running R2 from `r2-baseline` should be the canonical comparison point.

## User prompt (verbatim)

```
go
```

(Invoked immediately after writing the R2 spec; equivalent to "implement R2 now using the same hand-off contract used for R1".)

## Effective prompt the agent ran on

```
Implement the change at openspec/changes/bicycle-model/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md. Keep changes inside
vehicle-driving-simulator/.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R2: bicycle-model" and stop.
```

## Baseline commit

`r2-baseline` → `8b838fa` — `Add R2 OpenSpec change: bicycle-model`.
At baseline: completed R0/R1 (kinematic vehicle is the runtime default), agent policy doc, all evals through R1, multi-rung Pages deployment, R2 spec written.

## Resulting commit

`beb3204` — `R2: bicycle-model`. Tagged `r2-complete`.
