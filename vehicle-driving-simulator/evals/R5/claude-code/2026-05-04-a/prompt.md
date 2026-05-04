# Prompt — R5 / claude-code / 2026-05-04-a

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
Implement the change at openspec/changes/linear-tire-model/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R5: linear-tire-model" and stop.
```

## Baseline commit

`r5-baseline` → `a021677` — `Add R5 OpenSpec change: linear-tire-model`.

## Resulting commit

`91d5a70` — `R5: linear-tire-model`. Tag `r5-complete` to follow.
