# Notes — R5 / claude-code / 2026-05-04-a

## Outcome

Passed all five gates with **zero clarifying questions** and **zero diagnostic correction rounds** — only routine TypeScript / lint shake-out (one missing `slip: 0` initializer on the no-contact branch of the raycast result, one trailing-blank-line autofix). 89 unit tests across 15 files (R4 was 81/14; R5 adds 5 tire tests + 3 four-wheel R5-specific tests). Both Playwright e2e tests still pass against the new tire law.

R5 was the smallest rung in lines of code (235+/47-/6 files) since R3, reflecting that the R4 architecture had the right seams: per-wheel raycast, per-wheel `F_z` storage, and force application via `addForceAtPoint` were all in place — R5 just refines what's computed and how it's split across wheels.

## Interpretations the agent made

1. **Load-transfer estimate uses static `F_z`, not actual `F_z`.** R5 has a chicken-and-egg: `F_z` depends on `a_y`, `a_y` depends on `F_y`, `F_y` depends on `F_z`. Implementation breaks the loop by computing the load-transfer estimate's `a_y` using a tentative lateral force at *static* `F_z` (per-axle averages), then computing actual per-wheel `F_z` from that, then computing actual per-wheel lateral force from the actual `F_z`. This is one half-step lagged but keeps the calculation in-step (no iteration). The discrepancy is bounded by lateral-load-transfer-induced asymmetry, small in the linear regime. Documented inline.

2. **`state.slipF, state.slipR` switched from "current-velocity slip without δ" (R4 behavior) to "average of last-step per-wheel slip with δ" (R2-like).** R4's state getter recomputed slip from current body velocities and didn't subtract δ — that gave a different value from what the force calculation used. R5 stores per-wheel slip (with δ for front) in `wheelStates` from each step and the state getter returns averages. This matches R2's BicycleVehicle semantics and is what telemetry consumers expect. Behavioral difference at zero steer is zero; under steer the values differ by `δ/2` for the front axle. Documented inline.

3. **`cAlpha` param kept on `FourWheelVehicleParams` even though no longer consumed.** R4's tire force used `cAlpha` directly. R5's uses `tireModel.lateralForce(...)`. The `cAlpha` param is kept for backward construction compatibility (existing code that constructed `FourWheelVehicle` with `{ cAlpha: 80000 }` still works) but is informational only. Documented in the `FourWheelVehicleParams` JSDoc.

4. **Front wheel lateral force decomposed to `(F_y · cos δ, 0, −F_y · sin δ)` in body frame.** The tire's lateral direction is body +X rotated by δ around +Y, so the body-frame lateral force has both a body-X and a body-Z component. R4 only applied `F_y · cos δ` in body +X (per-axle). R5's per-wheel force application includes both components, which is more physically correct for steered wheels. Rear wheels (δ=0) get a pure body-X force.

5. **`tireModel` is invoked unconditionally for all four wheels each step, even when fz=0** (wheel not in contact). The linear law returns 0 in that case, so behavior is correct, and the spec scenario "TireModel SHALL be invoked exactly four times per step" is honored. R6's Pacejka must also handle `fz=0` cleanly (the formula's outer envelope `D = μ·F_z` makes this automatic).

## What went well

- **R2's heading sign convention and body-frame velocity formulas reused without modification.** Per-wheel kinematics (`v_x_at_wheel = vy + r·rz`, `v_z_at_wheel = vx − r·rx`) was a clean addition to existing math.
- **R4's `wheelStates` ring was the right home for per-wheel slip.** Adding the `slip: number` field to `WheelState` and populating it in step() aligned the state getter, the test surface, and the telemetry surface in one pass.
- **The replay-equivalence test extension was a one-line addition** (assert `wheels.<id>.slip` matches across runs) — no infrastructure changes.
- **All R0–R4 tests passed unchanged on the first run.** The architectural seams established by R0/R4 (renderer is a pure consumer, R4's bicycle/kinematic preserved as separate classes) made R5 a localized change.

## What surprised the agent

- **The `state.slipF, slipR` semantics drift between R2 and R4 was hidden.** R2's BicycleVehicle stored slip with δ baked in. R4's FourWheelVehicle state getter recomputed without δ. Neither rung's tests caught the divergence because they compared two parallel runs (both using the same convention). R5's per-wheel approach forced a re-resolution; chose R2's semantics. A different tool implementing R5 might have not noticed and kept R4's behavior.
- **The chicken-and-egg load-transfer dependency** isn't unique to R5 — it was already present in R4 (computing F_z from a_y, then NOT using F_z in lateral force was R4's escape valve). R5's load-sensitive lateral force surfaces it. The "estimate with static F_z" trick is the standard textbook resolution.

## What the agent did NOT do

- Did not modify `BicycleVehicle` or `KinematicVehicle`. R1/R2 tests pass byte-for-byte.
- Did not introduce reverse gear, longitudinal slip ratio, or per-axle stiffness asymmetry. Future-rung concerns.
- Did not add per-wheel `slip` to telemetry CSV — the per-wheel data is available via `state.wheels.<id>.slip` for tools that want it; CSV stays at R4's column set (`slip_f, slip_r` are now per-axle averages with δ baked in for the front).
- Did not add new runtime dependencies. Lockfile sha256 unchanged from R0.

## Eval-grader cues

- **Per-wheel left-vs-right slip difference under cornering** is the load-bearing R5 signal. Tests assert `slipFL ≠ slipFR` at non-zero yaw rate, with the magnitude consistent with `r·W/(2·v_z)`.
- **Total axle force at static load and small slip matches R4's `−Cα · α` within 0.5%** — verifies that the cα = 10.1 default preserves R4's straight-line steering response.
- **Replay equivalence within `1e-8` for state and `1e-6` for per-wheel `fz` and `slip`** — Rapier's determinism + the deterministic tire force formula combine to give byte-identical output across two parallel runs.
- The `tireModel` injection point is what R6 swaps Pacejka into. The interface is `lateralForce(slip, fz, axle): number` — narrow enough that a Pacejka model with `B, C, D, E` parameters fits cleanly.
