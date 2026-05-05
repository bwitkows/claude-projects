# Prompt — R7 / claude-code / 2026-05-04-a

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
Implement the change at openspec/changes/suspension-dynamics/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R7: suspension-dynamics" and stop.
```

## Baseline commit

`r7-baseline` → `1f826b2` — `Add R7 OpenSpec change: suspension-dynamics`.

## Resulting commit

`afdbf8f` — `R7: suspension-dynamics`. Tag `r7-complete` to follow.
