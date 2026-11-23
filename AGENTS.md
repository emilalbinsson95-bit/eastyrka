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

- Clip page overflow; wide tables scroll locally.
- Apply `applyVolumeGuards` (src/lib/volumeGuards.ts) after weak points/stance and before set protocols: comp lifts capped per session by rep range, 30 sets/session, 6–24 weekly sets per main lift, because stacked modifiers must never produce unrealistic sessions.
- EAk/E1RM use shared RTS and first qualifying sets; baselines match exact names/comp aliases only. Pool detrended EAk noise by mesocycle ID; thresholds come from athlete_eak_strategy (coach-set, default fallback), preserving history.
- EAk decisions require a plan_changed yes/no before saving and record next-window outcomes, so the coach overview can describe whether signals helped without claiming causation.
- Roster and statistics share chartMetrics, history windows and stored baselines per exercise/variant, so views agree.
- Block-to-block volume adaptation and fatigue-stop extra sets live in src/lib/blockVolume.ts and run before volume guards, because data-driven volume must still respect realism caps.
- Keep routine steps in src/lib/routines.ts matching Learn; persist stars per athlete in routine_completions (athlete insert, coach/admin read).
- Admins pass `is_coach_of` for every athlete so they can open any athlete's coach pages to inspect and fix data; skipped routines are stored as `routine='skipped'` rows in routine_completions (thumbs down), because stars and thumbs must share one auditable history.

- Runner strength ("Löparstyrka"): fixed 2 days, no MEV floors/guards; running has priority.

- Short full-body templates keep base slots via `applySessionSetBudget`; accessory sets trim first, main lifts keep ≥3.

- Catalog reads: shared defaults, owners, accepted care links, admins or RLS-visible prescriptions; expose only shared aliases and the availability singleton, to avoid catalog leakage.

- Seasons shift only unprepared blocks, allow gaps, detach without deleting; version-check writes.
- Coach singles replace work (not meet week/runners/short sessions); openers use recent RTS medians, not stale PRs/other stances.
- Resolve peak opener lift names through shared competition identity with a strict competition-note filter and stance checks, so competition aliases are included without admitting variants.
- Compare six first measurements by exercise/variant/rep interval (RTS-normalized); flagged warmups never count.


<!-- LOVABLE:BEGIN -->
- Represent own season blocks with `templateId: "manual"` and `manualWeeks`; create draft mesocycles and reuse the week/session editor without generator logic, so coaches control prescriptions.
<!-- LOVABLE:END -->
- D0 peak weeks start on their first session (zero-based days).
- `resizeTemplateWeeks` sets block length before modifiers, repeating the wave so effort never exceeds its hardest week.
- EAk presets (`eakStrategy.ts`) write the same strategy columns; generator EAk advice (`eakStatus.ts`) only fills coach-chosen set deltas, so nothing bypasses coach approval.
- Metrics: liftMetrics.ts; % rows: percentRows.ts (no protocols; guards skip light rows).
- Logged RPE is NULL only on % rows; readers use `isRatedRpe`.
- Builders (builderExercises.ts): after weak points; outside guards/EAk/protocols.
- Meet day: taper_followups (`competitionDay.ts`); attempts only via `save_competition_attempts`.
- percentLadder.ts excludes push lifts; volumeBench.ts is fixed (mesocycles.template_id), reordered only by `volume_bench_back_up`.
- EAk evaluations are unique per athlete/lift/window_end and parallel runs skip on conflict, because duplicate rows left phantom pending coach decisions.
- Max-rep sets count as rep records only on the planned load, because RPE-cap reductions would inflate records at the planned percent.
- `blockFinish.ts` runs last (after push): ramp-in/deload rows never exceed working-week intent, and empty RPE rows get suggested kg from own max/history, else a conservative comp-lift share for known variations — suggestions only, never baselines/EAk. Ramp-in −1 RPE is excluded from the wave's deviation, so a light first week never lowers the block.
- Block follow-up lives in `blockReview.ts` (published weeks only; peak blocks shown but never judged for stalls), overlaps in `planOverlaps.ts` (session dates, not week starts, because D0 weeks start on any weekday) and the pre-publish checklist in `publishCheck.ts`; all three only inform — the coach can always publish and nothing is changed automatically.
- Coach notices (coach_notices) reach athletes via accepted coach_athletes links only (`is_accepted_athlete_of`), never `is_coach_of`, because admins pass is_coach_of for everyone and would broadcast to every athlete.
- Coach baseline writes copy into push_state.plan_e1rm via the baselines_sync_push_plan trigger (coach auth only, one direction), so push loads follow coach-set maxima without push ever moving EAk baselines.
