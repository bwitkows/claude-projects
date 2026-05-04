# Prompt — R3 / claude-code / 2026-05-04-a

## Tool

Claude Code (CLI), model `claude-opus-4-7[1m]` (Opus 4.7, 1M context).

## System / persona

Default Claude Code system prompt + `vehicle-driving-simulator/AGENT_POLICY.md` as the operating contract.

Same self-eval caveat as R1/R2: same agent wrote the R3 spec and implemented it in a continuous session. Spec was tagged `r3-baseline` (`bc9553e`) before implementation began and was not edited during implementation.

## User prompt (verbatim)

```
go
```

(After `go ahead and move to R3` triggered the spec-writing phase, this `go` triggered the implementation hand-off.)

## Effective prompt the agent ran on

```
Implement the change at openspec/changes/terrain-and-camera/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md. Keep changes inside
vehicle-driving-simulator/.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R3: terrain-and-camera" and stop.
```

## Baseline commit

`r3-baseline` → `bc9553e` — `Add R3 OpenSpec change: terrain-and-camera`.
At baseline: completed R0/R1/R2, two evals deployed to Pages with token displays, multi-rung deploy workflow, R3 spec written.

## Resulting commit

`ca1e8ca` — `R3: terrain-and-camera`. Tagged `r3-complete`.
