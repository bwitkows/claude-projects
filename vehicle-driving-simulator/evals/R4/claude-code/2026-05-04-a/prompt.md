# Prompt — R4 / claude-code / 2026-05-04-a

## Tool

Claude Code (CLI), model `claude-opus-4-7[1m]` (Opus 4.7, 1M context).

## System / persona

Default Claude Code system prompt + `vehicle-driving-simulator/AGENT_POLICY.md`. Same self-eval caveat as prior rungs: same agent wrote and implemented the spec in one session.

## User prompt (verbatim)

```
go
```

## Effective prompt

```
Implement the change at openspec/changes/four-wheel-raycast/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R4: four-wheel-raycast" and stop.
```

## Baseline commit

`r4-baseline` → `0ef0a9a` — `Add R4 OpenSpec change: four-wheel-raycast`.

## Resulting commit

`f99c1bd` — `R4: four-wheel-raycast`. Tag `r4-complete` to follow.
