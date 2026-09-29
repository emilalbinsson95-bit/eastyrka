# Architecture decisions

- Keep password recovery on public `/forgot-password` and `/reset-password` routes, requiring a recovery auth event before accepting a new password; existing signed-in sessions must not turn a bare recovery URL into a password-change form.
- Store per-athlete squat, bench, and deadlift set-volume preferences in a separately protected athlete settings table; generated strength plans read the saved settings so coach and athlete see the same baseline.- Generate the 3-week peak in `src/lib/peaking.ts` from the athlete's logged history (lifts, recent weekly sets, estimated 1RM) and let it bypass the MEV volume floors, because a taper is deliberately sub-maintenance volume at maintained intensity.
