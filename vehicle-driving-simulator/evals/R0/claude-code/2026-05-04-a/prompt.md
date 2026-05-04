# Prompt — R0 / claude-code / 2026-05-04-a

## Tool

Claude Code (CLI), model `claude-opus-4-7[1m]` (Opus 4.7, 1M context).

## System / persona

Default Claude Code system prompt only — no custom persona, no `CLAUDE.md` in scope.
The user-level `~/.claude/projects/.../memory/` was active but contained no rung-specific guidance, only meta-facts about the user (project locations, PowerShell quirks, no-git-on-PATH workaround).

## User prompt (verbatim)

```
Implement the change at openspec/changes/project-bootstrap/.
  Acceptance criteria are in proposal.md. Tasks in tasks.md. Specs in
  specs/<capability>/spec.md. The project subfolder is otherwise empty —
  create everything inside vehicle-driving-simulator/ only.

  Don't ask clarifying questions. If the spec is ambiguous, document
  your interpretation in a code comment and proceed.

  When done, ensure all of these pass:
    npm run typecheck && npm run lint && npm test &&
    npm run build && npm run e2e

  Then commit with message "R0: project-bootstrap" and stop.
```

## Baseline commit

`3df1ac7` — `Restructure: move sim into vehicle-driving-simulator/ subfolder`.
The `vehicle-driving-simulator/` subfolder contained only `openspec/changes/project-bootstrap/` (proposal, design, tasks, four capability specs), `README.md`, and `MEASUREMENT.md`.

## Resulting commit

`dd0668b` — `R0: project-bootstrap`.
A follow-up commit `4b4eadc` added `AGENT_POLICY.md`. That commit was made *after* the user inspected the R0 result and asked for a separate policy artifact; it is **not** part of the R0 implementation and is excluded from `diff.patch`.
