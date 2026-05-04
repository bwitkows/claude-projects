# Prompt — R6 / claude-code / 2026-05-04-a

## Tool

Claude Code (CLI), model `claude-opus-4-7[1m]` (Opus 4.7, 1M context).

## System / persona

Default Claude Code system prompt + `vehicle-driving-simulator/AGENT_POLICY.md`. Same self-eval caveat as prior rungs.

## User prompt (verbatim)

```
go
```

## Effective prompt

```
Implement the change at openspec/changes/pacejka-tire-model/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R6: pacejka-tire-model" and stop.
```

## Baseline commit

`r6-baseline` → `2ea61fc` — `Add R6 OpenSpec change: pacejka-tire-model`.

## Resulting commit

`dcc3e36` — `R6: pacejka-tire-model`. Tag `r6-complete` to follow.
