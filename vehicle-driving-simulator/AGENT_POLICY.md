# Agent intervention policy

Guidance for any AI coding tool given a rung in this repository. This is the contract between the prompt and the tool — read it before starting.

## Default: no interventions

Each rung's prompt will explicitly tell you not to ask clarifying questions. Honor that. `humanInterventions` in `result.json` (see `MEASUREMENT.md`) is the metric you are being measured on, and zero is the target.

If the spec is ambiguous, missing, contradictory, or names APIs that have changed: **pick the most reasonable interpretation, document it in a comment at the point where the choice is made, and proceed.** Surface the interpretation in your final summary so the grader can flag it. Do not stop the run.

## Hard limits — when you SHOULD stop

Stop and surface the issue (do not silently work around it) only in these cases:

1. The repository state is unexpected — e.g., uncommitted changes you did not make, files referenced by the prompt that do not exist, a different branch than you were told to be on. Investigate before overwriting.
2. A required external service is unreachable in a way that cannot be skipped — e.g., npm registry down so dependencies cannot install at all.
3. An action the prompt requires would be destructive to the user's other work — e.g., a force-push, a `git reset --hard` over divergent history, deleting a branch with unmerged commits.
4. You complete the work but a check legitimately cannot pass without violating the spec. Report it; do not weaken the spec or skip the check.

That is the entire list. "I'm not sure which library API to use," "the spec doesn't say what color the ground should be," and "this version of the dep changed its API" are NOT on it. Pick something defensible and proceed.

## Documenting an interpretation

Two places, both required:

1. **At the choice point in code.** A short comment explaining what the spec said, what you interpreted it to mean, and why. The reader of the code six months later needs to find it without grep tricks.
2. **In your end-of-run summary.** A bulleted list of every nontrivial interpretation. The grader reads this before deciding whether to mark the run "passed" vs. "passed with caveats".

Do not create a separate interpretations doc. The code-comment + end-of-run-summary pair is the canonical record.

## What "done" means

The rung is **not** complete until all of these are green at the resulting commit:

```
npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```

If any one fails, you are not done. Run the full chain locally before committing. Do not commit a half-passing state and call it complete; that conflates "passed" with "partially passed" in the eval data.

## Anti-patterns

These all count as eval failures even if the checks pass:

- **Weakening the spec to ship green.** Removing assertions, lowering thresholds, deleting tests, or skipping checks is a worse outcome than leaving the rung incomplete. The eval is measuring whether you can satisfy the spec, not whether you can produce a clean exit code.
- **Editing `openspec/changes/<rung>/`.** The spec is your input. Modifying it is grading your own paper. If the spec is wrong, that is a finding, not a fix.
- **Introducing nondeterminism.** Replay equivalence is the foundation that every later rung depends on. `Math.random` without a seeded source, `Date.now()` reaching into sim code, `Set` iteration order in physics, etc. are deeper failures than a missing feature.
- **Floating dependency ranges.** Every version in `package.json` must be exact. No `^`, no `~`. Eval comparability requires it.
- **Creating unrequested docs.** No `NOTES.md`, no `CLAUDE.md`, no summary files unless the prompt explicitly asks for one.
- **Skipping hooks or signing.** No `--no-verify`, no bypassing pre-commit. If a hook fails, fix the underlying issue.
- **Force-pushing or amending shared commits.** Append commits; do not rewrite history.

## Commit hygiene

Use the exact commit message the prompt specifies. One commit per rung is the default; if you need more, the final state at the rung's tip is what is graded — keep intermediate commits buildable so `git bisect` over the rung ladder remains useful.

## When the prompt and this policy disagree

The rung's prompt wins. This file is the default; an explicit instruction in the prompt for that rung overrides it.
