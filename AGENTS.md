# Architecture decisions

- Keep readiness copy in locale dictionaries without changing scoring, to preserve history.

- Reconcile loads after overload: recalculate for rep/effort changes, clear for exercise/stance changes, so loads match prescriptions.
- Allocate historical accessory peaking volume once per week, not session, so frequency cannot multiply taper volume.

- Apply coach-selected protocols last, volume-neutrally; save per-set notes and first-set targets, because logging has one default and changed exercises must not inherit loads.

- Store monthly athlete payments in one admin-managed schedule; derive fixed calendar dates from its original start day, with RLS reads, never movable sessions.

- Reject outdated Vite dependency requests so updates reload instead of mixing React dispatchers.

- Keep coaching availability in a public-read, admin-write singleton and reuse its information component so counts agree.

- Gate calendar fueling on a current non-archived cycle window containing planned non-draft endurance work, because generated blocks retain draft status and endurance sessions lack cycle IDs.

- Keep password recovery on public `/forgot-password` and `/reset-password` routes, requiring a recovery auth event before accepting a new password; existing signed-in sessions must not turn a bare recovery URL into a password-change form.
- Persist coach-only lift-volume preferences for shared generation baselines.
- Build 2–4 week peaks from history with RTS estimates and no MEV floors; taper volume must stay reduced.

- Keep methodology on one route with running/strength/coaching tabs to preserve links.
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

- Runner strength template: fixed 2 days, skips MEV floors and volume guards (label "Löparstyrka"), as running takes priority.

- Short full-body templates keep base slots via `applySessionSetBudget`; accessory sets trim first, main lifts keep ≥3.

- Catalog reads allow shared defaults, owners, accepted care links, admins or RLS-visible prescriptions; only shared aliases and the availability singleton are exposed, preserving plans without catalog leakage.

- Keep season outlines separate; shift only unprepared blocks, allow gaps and detach without deleting programs. Version-check writes and resolve cycle links to prevent stale edits.
- Coach singles replace work, excluding meet week/runners/short sessions. Editable openers use recent RTS medians, not stale PRs or other stances.
- Compare first measurement sets across six matching exercise/variant/reps/RPE sessions, because isolated peaks distort trends.
