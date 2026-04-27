
# Powerlifting Coach Platform with EAkoefficient

A two-sided platform: coaches build weekly training plans and monitor their athletes' readiness; athletes log their sessions on mobile during training. The unique core is the **EAkoefficient** autoregulation engine from your prototype — translating each logged set into a daily readiness score and intra-set volume quality.

## Roles & access

- **Coach** — invites athletes, builds week plans, sets baselines, sees roster + analytics
- **Athlete** — logs into their own account, sees today's session, logs sets, views their own history
- Auth: email + password and Google sign-in. Roles stored in a separate `user_roles` table (secure pattern, never on profiles).

## Athlete experience (mobile-first)

**Today screen** (default after login)
- Big card with today's planned session: warmups + main lifts, each with target sets/reps/RPE
- Tap a set → quick-log sheet: weight, reps, RPE, optional comment
- Auto-fills weight from previous set; auto-increments set number
- Daily "Form" slider (1–10) at top of the session
- Live EAkoefficient % and status badge (Exhausted / Undertrained / Adapting / Peaking) appears under each set as soon as it's logged, so the athlete sees their readiness in real time
- Volume quality badge (Optimal / Acceptable / Junk) on sets 2+ based on E1RM drop from set 1

**History tab**
- Past sessions grouped by week
- Per-lift E1RM trend (simple line) and EAkoefficient over time

**Profile tab**
- Name, weight class, current 1RM baselines (read-only — coach edits these)

## Coach experience (desktop-first, responsive)

**Roster overview** (home)
- Card grid of all athletes, each showing: name, last session date, current readiness status color (from latest EAkoefficient), 7-day form average, and a "needs attention" flag if last status was Exhausted or last log >5 days ago
- Click an athlete → their detail view

**Athlete detail**
- Full EAkoefficient dashboard table (the one from your prototype: Date / Exercise / Set·Rep·Wt·RPE / Daily E1RM / EAkoeff% / Status / E1RM Drop / Volume Quality)
- Baselines editor (Knäböj, Bänkpress, Marklyft, Axelpress, Lår Curl, plus custom)
- "Assign plan" button → opens week builder

**Week builder**
- Pick a week (date range), athlete, and add sessions per day
- Each session = list of exercises with target sets × reps @ RPE (and optional weight target)
- Save as draft or publish to athlete (athlete sees it in their Today screen on the right date)
- "Save as template" + "Apply template" so the coach doesn't rebuild from scratch each week

**Athletes tab**
- Invite new athlete by email (sends signup link with role pre-assigned)
- Remove / archive athlete

## EAkoefficient engine (preserved from your prototype)

Computed identically to your code, server-side and client-side:
- `cappedReps = min(reps, 8)`
- `dailyE1RM = weight × (1 + (cappedReps + (10 − rpe)) / 30)`
- `EAkoeff% = dailyE1RM / baseline1RM × 100`
- Status thresholds: <92 Exhausted · 92–97 Undertrained · 97–102 Adapting · >102 Peaking
- Set-1 reference for the day per exercise → drop% on later sets → Optimal (≤4%) / Acceptable / Junk (≥5%)

Logic lives in a shared util used by both athlete logging UI and coach analytics.

## Information architecture (routes)

```text
/                          → marketing landing (what the platform does)
/login, /signup            → auth
/reset-password            → password reset

# Athlete (under _athlete guard)
/today                     → today's session + quick log
/history                   → past sessions, trends
/me                        → profile + baselines (read-only)

# Coach (under _coach guard)
/coach                     → roster overview
/coach/athletes/$id        → EAkoefficient dashboard for one athlete
/coach/athletes/$id/plan   → week builder for that athlete
/coach/templates           → reusable week templates
/coach/invites             → invite + manage athletes
```

After login, users are redirected by role: coach → `/coach`, athlete → `/today`.

## Data model

- `profiles` (id → auth.users, full_name, avatar_url, weight_class)
- `user_roles` (user_id, role: 'coach' | 'athlete') — separate table, RLS via `has_role()` security-definer function
- `coach_athletes` (coach_id, athlete_id) — many-to-one link
- `baselines` (athlete_id, exercise, one_rm_kg, updated_at)
- `week_plans` (id, athlete_id, coach_id, week_start_date, status: draft|published)
- `planned_sessions` (id, week_plan_id, day_of_week, notes)
- `planned_exercises` (id, planned_session_id, order, exercise, variation, target_sets, target_reps, target_rpe, target_weight)
- `training_logs` (id, athlete_id, date, form_score, exercise, variation, set_number, reps, weight_kg, rpe, comment, planned_exercise_id nullable)
- `plan_templates` + `plan_template_sessions` + `plan_template_exercises` (mirror of week structure, owned by coach)

RLS: athletes can only read/write their own logs and read their own published plans; coaches can read/write everything for athletes linked to them via `coach_athletes`.

## Visual style

Carry over the look from your prototype: clean white cards on slate-50, rounded-xl, subtle borders, blue accent for primary, color-coded status pills (red/blue/green/yellow) for EAkoefficient status, purple tint for volume-quality columns. Lucide icons. Mobile uses bottom tab bar (Today / History / Me); coach desktop uses top nav.

## Out of scope for v1 (can add later)

- Messaging / comments on sessions
- Multi-week mesocycle auto-progression
- Charts beyond simple E1RM trend line
- Admin tier above coaches
- Payments / subscriptions

## Build order

1. Auth + roles + profiles + role-based redirect
2. Baselines + EAkoefficient util (shared)
3. Athlete: Today + quick log + live EAkoeff feedback
4. Coach: roster overview + athlete detail dashboard (your prototype table)
5. Coach: invite athletes
6. Coach: week builder + athlete sees published plan on Today
7. Coach: templates
8. Athlete: history + trends
