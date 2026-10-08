# Architecture decisions

- Keep public coaching availability in a singleton table with public read access and admin-only writes enforced by RLS; reuse one information component so login and athlete information show the same saved counts.

- Keep password recovery on public `/forgot-password` and `/reset-password` routes, requiring a recovery auth event before accepting a new password; existing signed-in sessions must not turn a bare recovery URL into a password-change form.
- Store per-athlete squat, bench, and deadlift set-volume preferences in a separately protected athlete settings table; generated strength plans read the saved settings so coach and athlete see the same baseline.- Generate the 3-week peak in `src/lib/peaking.ts` from the athlete's logged history (lifts, recent weekly sets, estimated 1RM) and let it bypass the MEV volume floors, because a taper is deliberately sub-maintenance volume at maintained intensity.

- Keep the coach methodology on one route with three tabs (running, strength, coaching) so existing links remain valid and future coaching notes have a dedicated home.
- Weak points are solved by exercise selection in `src/lib/weakPoints.ts`: one per lift, swap the variation slot + one accessory/week only within a session cap (8/7/6 working exercises for 2/3/4+ days), replacing the least specific exercise by priority (comp > weak-point variation > comp variations > compound support > isolation > core), skipped in deloads; coach-only writes, because one fault per block keeps the stimulus clear and sessions realistic.
- Competition deadlift style (conventional/sumo) lives on athlete_strength_volume_profiles.deadlift_style and is applied last in generation (`applyDeadliftStyle`): sumo lifters may get conventional accessories, conventional lifters never get sumo work, because most conventional lifters can't reach a sumo stance.
- 1.5-rep variations are their own exercises (`exerciseVariants.ts`): load = main lift 1RM × 0.8, 3–5×3–5 @ RPE 6–8, counted as 1.25 sets in weekly volume, because each rep costs more than a normal rep.
- Accessory exercises are capped at 4 sets when topping templates up to MEV and 5 sets after individual scaling (unless the template itself prescribes more), because extra volume belongs on the main lifts and main lifts already give indirect accessory volume.
