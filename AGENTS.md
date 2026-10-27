# Architecture decisions

- Keep readiness copy in locale dictionaries without changing scoring, to preserve history.

- Reconcile loads after overload: recalculate for rep/effort changes, clear for exercise/stance changes, so loads match prescriptions.
- Allocate accessory peak volume weekly, not per session, to avoid multiplying taper work.

- Apply coach-selected protocols last, volume-neutrally; save per-set notes and first-set targets, because logging has one default and changed exercises must not inherit loads.

- Store monthly athlete payments in one admin-managed schedule; derive fixed calendar dates from its original start day, with RLS reads, never movable sessions.

- Reject outdated Vite dependency requests so updates reload instead of mixing React dispatchers.

- Keep coaching availability in a public-read, admin-write singleton and reuse its information component so counts agree.

- Gate calendar fueling on a current non-archived cycle window containing planned non-draft endurance work, because generated blocks retain draft status and endurance sessions lack cycle IDs.

- Keep password recovery on public `/forgot-password` and `/reset-password` routes, requiring a recovery auth event before accepting a new password; existing signed-in sessions must not turn a bare recovery URL into a password-change form.
- Persist coach-only lift-volume preferences for shared generation baselines.
- Build peaks from RTS history without MEV floors; preparation precedes taper. Taper cuts sets inside the athlete's own sessions (setsPerExposure × curve), keeping each lift's weekly frequency — a once-a-week lift never shrinks to one set mid-peak. Use peakingDates.ts to anchor seven-day windows before competition; empty leading windows are dropped. Never move saved programs.
- D0 peaks pick training weekdays by counting back from competition (`d0TrainingWeekdays`) so lift rule days land on sessions; peak history uses `isCompLift` (variants become accessories, robust six-session RTS median e1RM) and every pre-final session is filled with technique/variants/low-fatigue accessories, because variant sets inflated loads and left near-empty days.

- Keep methodology on one route with running/strength/coaching tabs to preserve links.
- Weak points (`src/lib/weakPoints.ts`): coach-only, one/lift, variation + one accessory/week; 8/7/6 exercise caps for 2/3/4+ days; replace comp > weak-point > variation > compound > isolation > core, skipping deloads for focus and realism.
- Store stance in athlete_strength_volume_profiles.deadlift_style; apply last via `applyDeadliftStyle`. Sumo lifters may get conventional accessories; never prescribe sumo to conventional lifters, whose stance mobility may not allow it.
- 1.5-rep variations are their own exercises (`exerciseVariants.ts`): load = main lift 1RM × 0.8, 3–5×3–5 @ RPE 6–8, counted as 1.25 sets in weekly volume, because each rep costs more than a normal rep.
- Accessory exercises are capped at 4 sets when topping templates up to MEV and 5 sets after individual scaling (unless the template itself prescribes more), because extra volume belongs on the main lifts and main lifts already give indirect accessory volume.

- Clip document-level horizontal overflow (no nested scroll container) and wrap role headers; wide tables/calendars keep local scrolling.
- Apply `applyVolumeGuards` (src/lib/volumeGuards.ts) after weak points/stance and before set protocols: comp lifts capped per session by rep range, 30 sets/session, 6–24 weekly sets per main lift, because stacked modifiers must never produce unrealistic sessions.
- EAk/E1RM use shared RTS and first qualifying sets; baselines match exact names/comp aliases only. Pool detrended EAk noise by mesocycle ID; thresholds come from athlete_eak_strategy (coach-set, default fallback), preserving history.
- EAk decisions require a plan_changed yes/no before saving and record next-window outcomes, so the coach overview can describe whether signals helped without claiming causation.
- Coach roster EAk uses the latest session's measurement per eligible lift; preserve full athlete/exercise composite keys in trend grouping so athletes and lifts never mix.
- Block-to-block volume adaptation and fatigue-stop extra sets live in src/lib/blockVolume.ts and run before volume guards, because data-driven volume must still respect realism caps.
- Keep routine steps in src/lib/routines.ts matching Learn; persist stars per athlete in routine_completions (athlete insert, coach/admin read).
- Admins pass `is_coach_of` for every athlete so they can open any athlete's coach pages to inspect and fix data; skipped routines are stored as `routine='skipped'` rows in routine_completions (thumbs down), because stars and thumbs must share one auditable history.

- Runner strength template: fixed 2 days, skips MEV floors and volume guards (label "Löparstyrka"), as running takes priority.

- Short full-body templates keep base slots via `applySessionSetBudget`; accessory sets trim first, main lifts keep ≥3.

- Catalog reads allow shared defaults, owners, accepted care links, admins or RLS-visible prescriptions; only shared aliases and the availability singleton are exposed, preserving plans without catalog leakage.

- Keep season outlines separate; shift only unprepared blocks, allow gaps and detach without deleting programs. Version-check writes and resolve cycle links to prevent stale edits.
- Coach singles replace work, excluding meet week/runners/short sessions. Editable openers use recent RTS medians, not stale PRs or other stances.
- Compare first measurement sets across six matching exercise/variant/reps/RPE sessions, because isolated peaks distort trends.

- Exclude flagged reference warmups from EAk/work progress to avoid distorted strength.

<!-- LOVABLE:BEGIN -->
- Represent own season blocks with `templateId: "manual"` and `manualWeeks`; create draft mesocycles and reuse the week/session editor without generator logic, so coaches control prescriptions.
<!-- LOVABLE:END -->
- D0 peak weeks start on their first session date with zero-based day_of_week (DB allows 0–6), so the calendar reads the offsets as zero-based and every session lands on its planned date.
