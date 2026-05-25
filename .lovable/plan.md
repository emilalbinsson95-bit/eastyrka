## What this changes

Three related fixes for endurance session logging:

### 1. Per-rep actuals inside repeat groups
Today a "4 × (4min hard / 1min easy)" group has only ONE actuals row per child step, even though the rep is run 4 times. Athletes can't capture pace/HR/RPE for each individual rep.

Add a new child table `endurance_step_reps`:
- `step_id` (the leaf step inside the repeat group)
- `rep_index` (1..repeat_count)
- `actual_duration_seconds`, `actual_distance_m`, `actual_avg_hr`, `actual_avg_rpe`

UI: when a leaf step's parent is a repeat group, render N "Rep 1, Rep 2, …" rows under it (one per `repeat_count`). Each row has the same compact inputs already used (mm:ss, distance, bpm, RPE) plus a derived pace badge. The existing single per-step actuals row stays for non-grouped steps and is hidden inside repeat groups (replaced by the per-rep rows).

RLS: same as `endurance_steps` (visible if parent session visible; managed if session editable).

### 2. Separate total-run data from per-step data
Avoid the confusion where an athlete fills in both the session-level "total time/distance/RPE" AND per-step actuals.

- **Quick mode (vanlig löpning):** keep the single `ActualLogger` (this is the "one rep of a run" case).
- **Structured mode (intervals):** hide the manual total-time/distance fields in `ActualLogger`. Instead auto-derive `actual_total_seconds` and `actual_distance_m` from the sum of step + rep actuals on save. Keep overall/peak RPE, predicted 10k, notes editable at session level. Show a small read-only summary "Total from steps: 48:12 · 9.4 km".
- This matches the user's mental model: a plain run is one rep of itself; intervals are summed from their reps.

### 3. Allow RPE x.5 everywhere
`overall_rpe` and `peak_rpe` are currently `smallint`, so 8.5 silently rounds. Migrate both to `numeric(3,1)` so 6.5 / 7.5 / 8.5 / 9.5 are accepted. The inputs already use `step={0.5}`; only the DB type needs to change. Also widen `endurance_step_reps.actual_avg_rpe` and `rehab` table fields stay as-is (not in scope).

## Files

- **DB migration:**
  - `ALTER TABLE endurance_sessions ALTER overall_rpe TYPE numeric(3,1)`, same for `peak_rpe`.
  - `CREATE TABLE endurance_step_reps` + RLS policies + index on `(step_id, rep_index)`.
- **`src/components/EnduranceSessionEditor.tsx`:**
  - `StepRowItem`: if the leaf step's `parent_id` points at a group, render `<RepActualsList stepId step repeatCount />` instead of the single `ActualStepInputs`.
  - New `RepActualsList` component: fetches `endurance_step_reps` for the step, shows N rows, upserts on save.
  - `ActualLogger`: in structured mode, hide total-time + distance inputs and compute them from steps/reps; keep RPE / notes / predicted 10k.
- **`src/lib/endurance.ts`:** small helper `sumActualSecondsFromSteps(steps, reps)` and `sumActualDistanceFromSteps(steps, reps)`.

## Out of scope (mentioned, not built)

- **Garmin API integration.** Requires Garmin Connect IQ developer registration, OAuth, server-side polling, and approval from Garmin — multi-week effort. Recommend keeping it as a future task; the per-rep manual flow above unblocks Garmin-watch users in the meantime.
