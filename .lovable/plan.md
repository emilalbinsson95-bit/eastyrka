## Goal

From the shared calendar, the athlete can click any day and add a **completed** session — either a run/bike/swim (with intervals and per-rep actuals: avg HR, pace/speed or distance, RPE, time) or a strength workout (exercises with sets × reps × weight × RPE). Everything feeds the existing strain/load aggregation.

## 1. Calendar — "Add session" affordance

`SharedCalendar.tsx` / `DayCell`:
- Add a small `+` button in the corner of each in-month day (athlete view only, hidden when `readOnly`).
- Clicking it opens a new `AddSessionDialog` pre-filled with that date.
- The dialog shows 3 paths:
  - **Quick run / bike / swim** (single block: duration + RPE)
  - **Structured run / bike / swim** (intervals — warmup / main / cooldown, repeat groups)
  - **Strength workout** (ad-hoc, athlete-owned, no coach week plan needed)
- On submit, create the row and either close (quick) or jump into the editor (structured/strength) to fill in details.

The existing "click card → preview" behaviour stays untouched.

## 2. Endurance — per-rep actuals

DB migration on `endurance_steps`:
- `actual_duration_seconds int`
- `actual_avg_hr smallint` (validate 40–230)
- `actual_distance_m int` (validate 0–200000) — used to derive pace/speed
- `actual_avg_rpe numeric(3,1)` (validate 1–10)
- Extend the existing `validate_endurance_step` trigger to cover the new ranges.

In `EnduranceSessionEditor.tsx` (`StepRowItem`, leaf step, athlete view):
- Add a second row of inputs labelled "Actual": time (mm:ss), distance (m/km depending on discipline), avg HR, RPE.
- Live-derive avg pace (run/swim) or avg speed (bike) from distance ÷ duration and show as a badge next to the planned target.
- For quick mode the existing `ActualLogger` already covers total time + RPE — leave it.

## 3. Strength — ad-hoc athlete workout

The current strength path is coach-driven (`week_plans → planned_sessions → planned_exercises`). Athletes already have RLS to insert into `training_logs` with `planned_exercise_id = null`, so we don't need new tables.

Add a lightweight `AdhocStrengthEditor` component:
- Header: title (string), date (locked to the day picked from the calendar).
- Add exercise rows: pick from `exercises` (existing autocomplete) or type freely → set count → list set inputs (reps, weight kg, RPE).
- On save, write N rows into `training_logs` (one per set) with the chosen date + the same `exercise` string, leaving `planned_exercise_id` null.
- A delete action removes all logs for that (`athlete_id`, `date`, `exercise`) tuple.

Calendar source:
- Extend `fetchCalendarItems` (`src/lib/calendar.ts`) with a 4th source `"adhoc_strength"` derived from `training_logs` rows where `planned_exercise_id is null` (grouped by `date`, one card per day labelled "Strength — N exercises").
- Clicking the card opens `AdhocStrengthEditor` in edit mode.

## 4. Load / strain integration

`enduranceLoad.ts` already aggregates by date + RPE + minutes. To keep ad-hoc strength visible in the existing weekly load chart, extend the data feed (in `EnduranceWeeklyOverview` and wherever the chart sources from) to also pull ad-hoc strength sessions:
- Per day with ad-hoc strength logs: synthesize a `LoadSession` (`discipline: "strength"`, `overall_rpe: avg rpe across sets`, `actual_total_seconds: sets × 90s` as a simple heuristic) so it shows up in the same stacked bars and total load.
- No change needed to `rpeWeight` / `sessionLoad`.

`SessionPreviewDialog.tsx`:
- Add a branch for the new `"adhoc_strength"` source that lists exercises + sets and shows strain via the same heuristic used for planned strength.

## 5. Technical details

- Files created:
  - `src/components/AddSessionDialog.tsx` — chooser + create mutations
  - `src/components/AdhocStrengthEditor.tsx` — sets editor backed by `training_logs`
  - one new migration for `endurance_steps` columns + trigger update
- Files modified:
  - `src/components/SharedCalendar.tsx` — `+` button, dialog wiring, new source rendering
  - `src/lib/calendar.ts` — add `adhoc_strength` source + types
  - `src/components/EnduranceSessionEditor.tsx` — per-step actuals UI + mutations
  - `src/components/SessionPreviewDialog.tsx` — handle `adhoc_strength`
  - `src/components/EnduranceWeeklyOverview.tsx` — feed ad-hoc strength into load
- All new writes are RLS-safe (athlete is `auth.uid()` on every insert).

## Out of scope (ask if you want any of these)

- Per-step HR zones / TSS-style scoring (we keep the existing RPE-weighted load).
- Strength **planning** by the athlete (creating a future week_plan) — this only adds **after-the-fact logging**.
- Bringing the new `+` button to the patient/rehab calendar.
