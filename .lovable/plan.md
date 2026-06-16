# Physio: training plans & workouts

Three things to ship:

## 1. Fix "create rehab session" failure

Current insert requires:
- `physio_id = auth.uid()` ✓
- `is_physio_of(auth.uid(), patient_id)` — needs a row in `physio_patients`

Today this silently fails for any patient who isn't already linked. The patient page is reachable from the roster (so the link exists there), but the form gives no error feedback if anything else goes wrong.

**Fix:**
- Show the real Supabase error in a toast (currently `onError` shows it, but the insert error message gets eaten by the navigate-on-success path if there's no row returned). Verify and harden.
- Add an explicit "physio role required" guard with a clear toast if `has_role(uid, 'physio')` is false.

## 2. Reusable rehab workout templates

New tables (mirrors coach's `plan_templates`):
- `rehab_plan_templates` — `id, physio_id, name, description, created_at`
- `rehab_plan_template_exercises` — `id, template_id, order_index, name, sets, reps, hold_seconds, load_kg, band_id, notes`

UI:
- `/physio/templates` — list, create, edit templates with the same exercise form as a session.
- In session page: "Load from template" button that bulk-inserts all template exercises into the current session.

## 3. Multi-week rehab plans

New tables (mirrors coach's `mesocycles` + `week_plans`):
- `rehab_plans` — `id, physio_id, patient_id, name, start_date, weeks, status, notes`
- `rehab_plan_sessions` — `id, plan_id, week_index, day_of_week, title, template_id (nullable)`

UI:
- On patient page: "New plan" — pick name, start date, weeks count.
- `/physio/patients/$patientId/plans/$planId` — week grid (Mon–Sun × N weeks), drop a template or empty session on any day. "Generate rehab sessions" button materializes `rehab_sessions` rows for each cell on the right date.

## Out of scope

- Drag-and-drop calendar (use simple dropdowns).
- Notifications when a planned session goes overdue.

## Technical notes

- All new tables: GRANT to `authenticated` + `service_role`, RLS scoped to `physio_id = auth.uid()` (and `patient_id = auth.uid()` SELECT for plans).
- Templates are physio-owned only.
- "Generate sessions" idempotent: skip cells already materialized.
