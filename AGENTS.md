# Architecture decisions

- Keep readiness copy in locale dictionaries without changing scoring, to preserve history.

- Reconcile loads after overload: recalculate for rep/effort changes, clear for exercise/stance changes, so loads match prescriptions.
- Allocate accessory peak volume weekly, not per session, to avoid multiplying taper work.

- Apply coach-selected protocols last, volume-neutrally; save per-set notes and first-set targets, because logging has one default and changed exercises must not inherit loads.

- Store monthly athlete payments in one admin-managed schedule; derive fixed calendar dates from its original start day, with RLS reads, never movable sessions.

- Reject outdated Vite dependency requests so React dispatchers never mix.

- Keep coaching availability in a public-read, admin-write singleton and reuse its information component so counts agree.

- Show calendar fueling only inside a current non-archived cycle with planned non-draft endurance work (drafts and missing cycle IDs exist).

- Keep password recovery on public `/forgot-password` and `/reset-password` routes, requiring a recovery auth event before accepting a new password; existing signed-in sessions must not turn a bare recovery URL into a password-change form.
- Persist coach-only lift-volume preferences for shared generation baselines.
- Build peaks from RTS history without MEV floors; preparation precedes taper. Taper cuts sets inside the athlete's own sessions (setsPerExposure × curve), keeping each lift's weekly frequency — a once-a-week lift never shrinks to one set mid-peak. Use peakingDates.ts to anchor seven-day windows before competition; empty leading windows are dropped. Never move saved programs.
- D0 peaks pick training weekdays by counting back from competition (`d0TrainingWeekdays`) so lift rule days land on sessions; peak history uses `isCompLift` (variants become accessories, robust six-session RTS median e1RM) and every pre-final session is filled with technique/variants/low-fatigue accessories, because variant sets inflated loads and left near-empty days.

- Keep methodology on one route with running/strength/coaching tabs to preserve links.
- Weak points (`src/lib/weakPoints.ts`): coach-only, one/lift, variation + one accessory/week; 8/7/6 exercise caps for 2/3/4+ days; replace comp > weak-point > variation > compound > isolation > core, skipping deloads for focus and realism.
- Store stance in athlete_strength_volume_profiles.deadlift_style; apply last via `applyDeadliftStyle`. Sumo lifters may get conventional accessories; never prescribe sumo to conventional lifters, whose stance mobility may not allow it.
- 1.5-rep variations (`exerciseVariants.ts`): 1RM×0.8, 3–5×3–5 @ RPE 6–8, 1.25 volume sets each, as reps cost more.
- Accessories cap at 4 sets for MEV top-up and 5 after scaling (unless the template prescribes more); extra volume belongs on main lifts.

- Clip page-level horizontal overflow; wide tables/calendars scroll locally.
- Apply `applyVolumeGuards` (src/lib/volumeGuards.ts) after weak points/stance and before set protocols: comp lifts capped per session by rep range, 30 sets/session, 6–24 weekly sets per main lift, because stacked modifiers must never produce unrealistic sessions.
- EAk/E1RM use shared RTS and first qualifying sets; baselines match exact names/comp aliases only. Pool detrended EAk noise by mesocycle ID; thresholds come from athlete_eak_strategy (coach-set, default fallback), preserving history.
- EAk decisions require a plan_changed yes/no before saving and record next-window outcomes, so the coach overview can describe whether signals helped without claiming causation.
- Roster and statistics share chartMetrics, history windows and stored baselines per exercise/variant, so views agree.
- Block-to-block volume adaptation and fatigue-stop extra sets live in src/lib/blockVolume.ts and run before volume guards, because data-driven volume must still respect realism caps.
- Keep routine steps in src/lib/routines.ts matching Learn; persist stars per athlete in routine_completions (athlete insert, coach/admin read).
- Admins pass `is_coach_of` for every athlete so they can open any athlete's coach pages to inspect and fix data; skipped routines are stored as `routine='skipped'` rows in routine_completions (thumbs down), because stars and thumbs must share one auditable history.

- Runner strength template: fixed 2 days, skips MEV floors and volume guards (label "Löparstyrka"), as running takes priority.

- Short full-body templates keep base slots via `applySessionSetBudget`; accessory sets trim first, main lifts keep ≥3.

- Catalog reads: shared defaults, owners, accepted care links, admins or RLS-visible prescriptions; expose only shared aliases and the availability singleton, to avoid catalog leakage.

- Season outlines: shift only unprepared blocks, allow gaps, detach without deleting programs; version-check writes.
- Coach singles replace work, excluding meet week/runners/short sessions. Editable openers use recent RTS medians, not stale PRs or other stances.
- Resolve peak opener lift names through shared competition identity with a strict competition-note filter and stance checks, so competition aliases are included without admitting variants.
- Compare six first measurements by exercise/variant/rep interval; RTS normalizes RPE without fragmenting trends.

- Flagged reference warmups never count in EAk/work progress (distorts strength).

<!-- LOVABLE:BEGIN -->
- Represent own season blocks with `templateId: "manual"` and `manualWeeks`; create draft mesocycles and reuse the week/session editor without generator logic, so coaches control prescriptions.
<!-- LOVABLE:END -->
- D0 peak weeks start on their first session date with zero-based day_of_week, so sessions land on planned dates.
- Template block length (1–12 working weeks + optional deload) is set by `resizeTemplateWeeks` before modifiers; longer blocks repeat the template wave so effort never exceeds its hardest week.
- Push: first set semi-fixed (±START_WEIGHT_TOLERANCE_KG); push weeks fold push-lift singles into main sets, cap light loads at main weight, use push notes, so plans never contradict push.
- Calendar treats planned sessions with linked logged sets as done (solid, check icon) without needing athlete confirmation, so trained days never look like open suggestions.
