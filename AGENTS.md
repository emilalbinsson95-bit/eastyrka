# Architecture decisions

- Keep readiness guidance in locale dictionaries without changing scoring, because copy updates must preserve historical comparisons.

- Reconcile loads after overload: recalculate for rep/effort changes, clear for exercise/stance changes, so loads match prescriptions.
- Allocate historical accessory peaking volume once per week, not session, so frequency cannot multiply taper volume.

- Apply coach-selected protocols last, volume-neutrally; save per-set notes and first-set targets, because logging has one default and changed exercises must not inherit loads.

- Store one admin-managed monthly payment schedule per athlete and derive fixed calendar occurrences from its original start day; athlete reads are RLS-protected, and reminders never become movable training sessions.

- Reject outdated Vite dependency requests so updates reload instead of mixing React dispatchers.

- Keep coaching availability in a public-read, admin-write singleton and reuse its information component so counts agree.

- Gate calendar fueling on a current non-archived cycle window containing planned non-draft endurance work, because generated blocks retain draft status and endurance sessions lack cycle IDs.

- Keep password recovery on public `/forgot-password` and `/reset-password` routes, requiring a recovery auth event before accepting a new password; existing signed-in sessions must not turn a bare recovery URL into a password-change form.
- Store per-athlete squat, bench, and deadlift set-volume preferences in a separately protected athlete settings table; generated strength plans read the saved settings so coach and athlete see the same baseline.- Generate the 3-week peak in `src/lib/peaking.ts` from the athlete's logged history (lifts, recent weekly sets, estimated 1RM) and let it bypass the MEV volume floors, because a taper is deliberately sub-maintenance volume at maintained intensity.

- Keep the coach methodology on one route with three tabs (running, strength, coaching) so existing links remain valid and future coaching notes have a dedicated home.
- Weak points (`src/lib/weakPoints.ts`): coach-only, one/lift, variation + one accessory/week; 8/7/6 exercise caps for 2/3/4+ days; replace comp > weak-point > variation > compound > isolation > core, skipping deloads for focus and realism.
- Competition deadlift style (conventional/sumo) lives on athlete_strength_volume_profiles.deadlift_style and is applied last in generation (`applyDeadliftStyle`): sumo lifters may get conventional accessories, conventional lifters never get sumo work, because most conventional lifters can't reach a sumo stance.
- 1.5-rep variations are their own exercises (`exerciseVariants.ts`): load = main lift 1RM × 0.8, 3–5×3–5 @ RPE 6–8, counted as 1.25 sets in weekly volume, because each rep costs more than a normal rep.
- Accessory exercises are capped at 4 sets when topping templates up to MEV and 5 sets after individual scaling (unless the template itself prescribes more), because extra volume belongs on the main lifts and main lifts already give indirect accessory volume.

- Clip document-level horizontal overflow (no nested scroll container) and wrap role headers; wide tables/calendars keep local scrolling.
- Apply `applyVolumeGuards` (src/lib/volumeGuards.ts) after weak points/stance and before set protocols: comp lifts capped per session by rep range, 30 sets/session, 6–24 weekly sets per main lift, because stacked modifiers must never produce unrealistic sessions.
- EAk and E1RM use the shared RTS table with the first qualifying set as measurement; baselines match exact names or competition aliases only, because late singles and variation baselines distort loads and fatigue.
- Coach roster EAk uses the latest session's measurement per eligible lift; preserve full athlete/exercise composite keys in trend grouping so athletes and lifts never mix.
- Block-to-block volume adaptation and fatigue-stop extra sets live in src/lib/blockVolume.ts and run before volume guards, because data-driven volume must still respect realism caps.
- Guided routines (morning flow long/short, warm-up) live as step data in src/lib/routines.ts and completions are stored per athlete in routine_completions (athlete insert, coach/admin read), because the star count must persist and the steps must match the Learn page text.
- Admins pass `is_coach_of` for every athlete so they can open any athlete's coach pages to inspect and fix data; skipped routines are stored as `routine='skipped'` rows in routine_completions (thumbs down), because stars and thumbs must share one auditable history.

- Runner strength template: fixed 2 days, skips MEV floors and volume guards (label "Löparstyrka"), because running takes priority.

- Short full-body templates keep base slots via `applySessionSetBudget`; accessory sets trim first, main lifts keep ≥3.

- Catalog reads allow shared defaults, owners, accepted care links, admins or RLS-visible prescriptions; only shared aliases and the availability singleton are exposed, preserving plans without catalog leakage.
