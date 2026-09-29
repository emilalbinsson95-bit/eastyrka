# Architecture decisions

- Keep password recovery on public `/forgot-password` and `/reset-password` routes, requiring a recovery auth event before accepting a new password; existing signed-in sessions must not turn a bare recovery URL into a password-change form.
- Store per-athlete squat, bench, and deadlift set-volume preferences in a separately protected athlete settings table; generated strength plans read the saved settings so coach and athlete see the same baseline.