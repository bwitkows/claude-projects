# Prompt — R8 / claude-code / 2026-05-05-a

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
Implement the change at openspec/changes/telemetry-and-replay/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R8: telemetry-and-replay" and stop.
```

## Baseline commit

`r8-baseline` → `a321d5a` — `Add R8 OpenSpec change: telemetry-and-replay`.

## Resulting commit

`a0f60c7` — `R8: telemetry-and-replay`. Tag `r8-complete` to follow.
