## Shared Calendar — Plan

A single calendar surface visible to both sides of each relationship (athlete↔coach, patient↔physio). The coach/physio's deployed day shows as a **ghost** suggestion; the athlete/patient confirms or drags it to any date, which becomes the committed day. Both sides always see the same state.

### Scope
- Strength sessions (from `week_plans` → `planned_sessions`)
- Endurance sessions (`endurance_sessions`)
- Rehab sessions (`rehab_sessions`)
- Readiness markers (small dot per day with `daily_form`)

### Routes
- `/_app/calendar` — athlete's own calendar (also surfaces rehab if they're a patient)
- `/patient/calendar` — patient's calendar
- `/coach/athletes/$athleteId/calendar` — coach view of one athlete
- `/physio/patients/$patientId/calendar` — physio view of one patient

All four routes render the same `<SharedCalendar />` component with a `readOnly` flag for the coach/physio side.

### Data model
New table `session_schedule_overrides` acts as a single source of truth for "where this session actually lives":

```
session_schedule_overrides
  id uuid pk
  owner_id uuid          -- athlete or patient
  source_type text       -- 'planned' | 'endurance' | 'rehab'
  source_id uuid
  scheduled_date date
  confirmed_at timestamptz   -- null = still a ghost suggestion
  unique(source_type, source_id)
```

RLS:
- owner can full CRUD where `owner_id = auth.uid()`
- coach can SELECT where `is_coach_of(auth.uid(), owner_id)`
- physio can SELECT where `is_physio_of(auth.uid(), owner_id)`

Reads merge the override (if present + confirmed) with the source's "suggested date":
- planned strength → `week_plans.week_start_date + planned_sessions.day_of_week`
- endurance → `endurance_sessions.date`
- rehab → `rehab_sessions.session_date`

A session with no override (or `confirmed_at IS NULL`) renders as a **ghost card** on the suggested day. After the athlete confirms/drags it, it renders solid on `scheduled_date`.

### UI
- Month grid built with `date-fns` + `@dnd-kit/core` (already installed).
- Day cell shows: readiness dot, ghost cards (dashed border, "Suggested"), confirmed cards (solid).
- Athlete actions: drag card to another day → upsert override with `confirmed_at = now()`. "Accept" button on ghost cards → confirm in place.
- Coach/physio view: same grid, but cards are not draggable; small "Suggested → Moved to {date}" hint shows on cards the athlete moved.
- Click a card → opens the existing session detail.

### Files
- `supabase/migrations/...sql` — table + RLS + trigger to enforce `source_id` existence
- `src/lib/calendar.ts` — merge logic (suggested vs confirmed)
- `src/components/SharedCalendar.tsx` — the month-view component
- `src/components/CalendarSessionCard.tsx`
- `src/routes/_app.calendar.tsx`
- `src/routes/patient.calendar.tsx`
- `src/routes/coach.athletes.$athleteId.calendar.tsx`
- `src/routes/physio.patients.$patientId.calendar.tsx`
- Nav link added in `_app.tsx`, `patient.tsx`, athlete + patient detail pages

### Out of scope (for this turn)
- Approval workflow (athlete proposes → coach approves) — answered as "free move".
- Recurring-event editing across a whole week in one drag.
- iCal export / Google Calendar sync.