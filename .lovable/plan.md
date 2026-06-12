# Physio + patient: progression, bands, self-patient, stiffness check-in

Four focused additions, no copy of the athlete stats stack.

## 1. Band library (shared reference)

New table `public.resistance_bands` (id, color, label, min_kg, max_kg, sort_order, created_by, timestamps). Visible to all authenticated users; only physios/coaches can insert/update/delete (their own rows + service_role). Seed Lovable's defaults:

```text
Yellow  2– 5 kg    Red    5–15 kg
Green   4–10 kg    Black 10–25 kg
Blue    7–18 kg    Silver 15–35 kg
```

Add band fields to `public.rehab_exercises`:
- `band_id uuid references resistance_bands` (nullable)
- `band_min_kg numeric` / `band_max_kg numeric` (snapshot at prescription)

New page `src/routes/physio.bands.tsx` (linked from the physio nav): CRUD list — color swatch, label, kg range. Reused inside the rehab exercise editor as a band picker (sets `band_id` and snapshots the kg range).

## 2. Progression dashboard (no "stats")

Shared component `src/components/ProgressionDashboard.tsx`, used by:
- `src/routes/physio.patients.$patientId.progression.tsx` (with back-to-patient link)
- `src/routes/patient.progression.tsx` (added to patient nav)

Four cards (matches your picks):

1. **Per-exercise progression** — for each rehab exercise the patient has done, a small line chart of reps × sets × band tension (kg, midpoint of band range) over time. Latest delta shown.
2. **Stiffness trend** — 30-day line of daily check-ins (see §4). Latest value + 7-day avg.
3. **Function tests** — table + per-test sparkline. Backed by a new table `public.function_tests` (patient_id, test_type, value_numeric, unit, side `left|right|bilateral|na`, tested_at, notes, recorded_by). Seeded test types: ROM (deg), single-leg hop (cm), balance hold (sec), Y-balance, isometric strength (kg). Physio adds entries; patient can see them read-only.
4. **Adherence** — sessions completed vs prescribed in the last 4 weeks (% + streak). Uses existing `rehab_sessions` + planned/override tables already in the schema.

No EAk, no CTL/ATL, no 20-session gate.

## 3. Physio self-patient toggle

Add `PhysioRoleSwitcher` modeled exactly on `RoleSwitcher`:
- One-click "Enable patient view" → grants `patient` role to self, links self in `physio_patients` (physio_id = patient_id = self), idempotent.
- Once enabled, dropdown switches between Physio view (`/physio`) and Patient view (`/patient`).
- Mounted in the physio header next to notifications.

Also add `src/routes/physio.me.tsx` (mirror of `coach.me`) so physios have a profile + roster page.

## 4. Daily stiffness check-in (lightweight)

New table `public.patient_checkins` (patient_id, date unique-per-patient, stiffness smallint 0–10, note text, timestamps). RLS: patient owns rows; linked physios can read (via `is_physio_of`). Trigger validates 0–10 range. NOT using `readiness_surveys` — those are athlete-side and heavier.

UI: single-slider card on `patient.index.tsx` ("How stiff today? 0–10") with a Save button. Today's value displayed if already submitted; one entry per day (upsert). The stiffness trend card in §2 reads from this table.

## Out of scope (this turn)
Pain rating UI, ROM measurement tools, video uploads, return-to-sport algorithm, methodology page for physio.

## Technical notes
- Migration is one call: enum-free, 2 new tables + 3 columns on rehab_exercises + GRANTs + RLS + validation triggers + seed insert for bands.
- Band kg used in progression chart = `(band_min_kg + band_max_kg) / 2` when no explicit kg is logged on the set.
- All new routes use `useQuery`/`useSuspenseQuery`; no server functions needed (everything reachable with the browser supabase client + RLS).
- i18n keys added to `src/locales/en.json` and `sv.json` for nav items ("Bands", "Progression", "Patient view").
