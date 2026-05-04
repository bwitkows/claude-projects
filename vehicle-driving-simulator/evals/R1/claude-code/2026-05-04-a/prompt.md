# Prompt — R1 / claude-code / 2026-05-04-a

## Tool

Claude Code (CLI), model `claude-opus-4-7[1m]` (Opus 4.7, 1M context).

## System / persona

Default Claude Code system prompt. The repo's `vehicle-driving-simulator/AGENT_POLICY.md` was in scope and was treated as the operating contract: zero clarifying questions, document interpretations in code + final summary, run all five gates before stopping, no spec edits.

The same conversation that performed R0 wrote the R1 spec immediately before this run. The R1 implementation work began from baseline `21887ed` and was driven by the user message "hand R1 to claude-code". This is borderline self-evaluation territory: the agent that *wrote* the R1 spec is the same agent *implementing* it. That is a measurement caveat (see `notes.md`), not a procedural failure — the spec is fixed at `r1-baseline` and was not edited during implementation.

## User prompt (verbatim)

```
hand R1 to claude-code
```

## Effective prompt the agent ran on

The agent treated the user message as equivalent to the standard rung-handoff prompt, parameterized for R1:

```
Implement the change at openspec/changes/kinematic-vehicle/.
Acceptance criteria are in proposal.md. Tasks in tasks.md.
Specs in specs/<capability>/spec.md. Keep changes inside
vehicle-driving-simulator/.

Don't ask clarifying questions. If the spec is ambiguous, document
your interpretation in a code comment and proceed.

When done, ensure all of these pass:
  npm run typecheck && npm run lint && npm test &&
  npm run build && npm run e2e

Then commit with message "R1: kinematic-vehicle" and stop.
```

## Baseline commit

`r1-baseline` → `21887ed` — `Add R1 OpenSpec change: kinematic-vehicle`.
Working tree at baseline: completed R0 scaffolding (sim core, physics, rendering, telemetry, input, app, CI), the R0 eval artifacts, `AGENT_POLICY.md`, and the R1 spec under `openspec/changes/kinematic-vehicle/`. No vehicle code yet.

## Resulting commit

`9fe54d3` — `R1: kinematic-vehicle`. Tagged `r1-complete`.
