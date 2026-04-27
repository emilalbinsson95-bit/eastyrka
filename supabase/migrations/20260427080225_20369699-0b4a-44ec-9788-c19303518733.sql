
-- =========================================
-- ENUMS
-- =========================================
create type public.app_role as enum ('coach', 'athlete');
create type public.plan_status as enum ('draft', 'published');

-- =========================================
-- PROFILES
-- =========================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  weight_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- =========================================
-- USER ROLES (separate table — security best practice)
-- =========================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- Security-definer function to check role without RLS recursion
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- =========================================
-- COACH <-> ATHLETE LINK
-- =========================================
create table public.coach_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);
alter table public.coach_athletes enable row level security;
create index on public.coach_athletes (coach_id);
create index on public.coach_athletes (athlete_id);

-- Helper: is the given coach linked to the given athlete?
create or replace function public.is_coach_of(_coach_id uuid, _athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coach_athletes
    where coach_id = _coach_id and athlete_id = _athlete_id
  )
$$;

-- =========================================
-- BASELINES (per-athlete current 1RMs)
-- =========================================
create table public.baselines (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  one_rm_kg numeric(6,2) not null check (one_rm_kg >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (athlete_id, exercise)
);
alter table public.baselines enable row level security;
create index on public.baselines (athlete_id);

-- =========================================
-- TRAINING LOGS
-- =========================================
create table public.training_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  form_score smallint check (form_score between 1 and 10),
  exercise text not null,
  variation text,
  set_number smallint not null check (set_number >= 1),
  reps smallint not null check (reps >= 1),
  weight_kg numeric(6,2) not null check (weight_kg >= 0),
  rpe numeric(3,1) not null check (rpe >= 1 and rpe <= 10),
  comment text,
  planned_exercise_id uuid,
  created_at timestamptz not null default now()
);
alter table public.training_logs enable row level security;
create index on public.training_logs (athlete_id, date);
create index on public.training_logs (athlete_id, exercise);

-- =========================================
-- WEEK PLANS
-- =========================================
create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  status public.plan_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, week_start_date)
);
alter table public.week_plans enable row level security;
create index on public.week_plans (athlete_id, week_start_date);

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.week_plans(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  title text,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.planned_sessions enable row level security;
create index on public.planned_sessions (week_plan_id);

create table public.planned_exercises (
  id uuid primary key default gen_random_uuid(),
  planned_session_id uuid not null references public.planned_sessions(id) on delete cascade,
  order_index smallint not null default 0,
  exercise text not null,
  variation text,
  target_sets smallint not null check (target_sets >= 1),
  target_reps smallint not null check (target_reps >= 1),
  target_rpe numeric(3,1),
  target_weight_kg numeric(6,2),
  notes text,
  created_at timestamptz not null default now()
);
alter table public.planned_exercises enable row level security;
create index on public.planned_exercises (planned_session_id);

-- Add FK now that planned_exercises exists
alter table public.training_logs
  add constraint training_logs_planned_exercise_fk
  foreign key (planned_exercise_id) references public.planned_exercises(id) on delete set null;

-- =========================================
-- PLAN TEMPLATES (coach-owned, reusable)
-- =========================================
create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
alter table public.plan_templates enable row level security;
create index on public.plan_templates (coach_id);

create table public.plan_template_sessions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_templates(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  title text,
  notes text
);
alter table public.plan_template_sessions enable row level security;
create index on public.plan_template_sessions (template_id);

create table public.plan_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_session_id uuid not null references public.plan_template_sessions(id) on delete cascade,
  order_index smallint not null default 0,
  exercise text not null,
  variation text,
  target_sets smallint not null check (target_sets >= 1),
  target_reps smallint not null check (target_reps >= 1),
  target_rpe numeric(3,1),
  target_weight_kg numeric(6,2),
  notes text
);
alter table public.plan_template_exercises enable row level security;
create index on public.plan_template_exercises (template_session_id);

-- =========================================
-- TRIGGERS
-- =========================================
-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger week_plans_set_updated_at before update on public.week_plans
  for each row execute function public.set_updated_at();
create trigger baselines_set_updated_at before update on public.baselines
  for each row execute function public.set_updated_at();

-- Auto-create profile + default athlete role on new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  -- Default everyone to athlete; coaches must be granted the role explicitly
  insert into public.user_roles (user_id, role)
  values (new.id, 'athlete')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================
-- RLS POLICIES
-- =========================================

-- PROFILES
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "Coaches can view their athletes' profiles"
  on public.profiles for select to authenticated
  using (public.is_coach_of(auth.uid(), id));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- USER_ROLES — read your own; only server/admin can change
create policy "Users can view their own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- COACH_ATHLETES
create policy "Coaches can view their links"
  on public.coach_athletes for select to authenticated
  using (coach_id = auth.uid());

create policy "Athletes can view their links"
  on public.coach_athletes for select to authenticated
  using (athlete_id = auth.uid());

create policy "Coaches can create links to themselves"
  on public.coach_athletes for insert to authenticated
  with check (coach_id = auth.uid() and public.has_role(auth.uid(), 'coach'));

create policy "Coaches can delete their own links"
  on public.coach_athletes for delete to authenticated
  using (coach_id = auth.uid());

-- BASELINES
create policy "Athlete can view own baselines"
  on public.baselines for select to authenticated
  using (athlete_id = auth.uid());

create policy "Coach can view athlete baselines"
  on public.baselines for select to authenticated
  using (public.is_coach_of(auth.uid(), athlete_id));

create policy "Coach can insert athlete baselines"
  on public.baselines for insert to authenticated
  with check (public.is_coach_of(auth.uid(), athlete_id));

create policy "Coach can update athlete baselines"
  on public.baselines for update to authenticated
  using (public.is_coach_of(auth.uid(), athlete_id))
  with check (public.is_coach_of(auth.uid(), athlete_id));

create policy "Coach can delete athlete baselines"
  on public.baselines for delete to authenticated
  using (public.is_coach_of(auth.uid(), athlete_id));

-- TRAINING_LOGS
create policy "Athlete can view own logs"
  on public.training_logs for select to authenticated
  using (athlete_id = auth.uid());

create policy "Coach can view athlete logs"
  on public.training_logs for select to authenticated
  using (public.is_coach_of(auth.uid(), athlete_id));

create policy "Athlete can insert own logs"
  on public.training_logs for insert to authenticated
  with check (athlete_id = auth.uid());

create policy "Coach can insert logs for their athletes"
  on public.training_logs for insert to authenticated
  with check (public.is_coach_of(auth.uid(), athlete_id));

create policy "Athlete can update own logs"
  on public.training_logs for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

create policy "Coach can update athlete logs"
  on public.training_logs for update to authenticated
  using (public.is_coach_of(auth.uid(), athlete_id))
  with check (public.is_coach_of(auth.uid(), athlete_id));

create policy "Athlete can delete own logs"
  on public.training_logs for delete to authenticated
  using (athlete_id = auth.uid());

create policy "Coach can delete athlete logs"
  on public.training_logs for delete to authenticated
  using (public.is_coach_of(auth.uid(), athlete_id));

-- WEEK_PLANS
create policy "Coach can view their own week plans"
  on public.week_plans for select to authenticated
  using (coach_id = auth.uid());

create policy "Athlete can view their published plans"
  on public.week_plans for select to authenticated
  using (athlete_id = auth.uid() and status = 'published');

create policy "Coach can create plans for their athletes"
  on public.week_plans for insert to authenticated
  with check (coach_id = auth.uid() and public.is_coach_of(auth.uid(), athlete_id));

create policy "Coach can update their own plans"
  on public.week_plans for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy "Coach can delete their own plans"
  on public.week_plans for delete to authenticated
  using (coach_id = auth.uid());

-- PLANNED_SESSIONS — gated by parent week_plan
create policy "Sessions visible if parent plan visible"
  on public.planned_sessions for select to authenticated
  using (
    exists (
      select 1 from public.week_plans wp
      where wp.id = week_plan_id
        and (wp.coach_id = auth.uid() or (wp.athlete_id = auth.uid() and wp.status = 'published'))
    )
  );

create policy "Coach manages sessions of own plans (insert)"
  on public.planned_sessions for insert to authenticated
  with check (
    exists (select 1 from public.week_plans wp where wp.id = week_plan_id and wp.coach_id = auth.uid())
  );

create policy "Coach manages sessions of own plans (update)"
  on public.planned_sessions for update to authenticated
  using (
    exists (select 1 from public.week_plans wp where wp.id = week_plan_id and wp.coach_id = auth.uid())
  )
  with check (
    exists (select 1 from public.week_plans wp where wp.id = week_plan_id and wp.coach_id = auth.uid())
  );

create policy "Coach manages sessions of own plans (delete)"
  on public.planned_sessions for delete to authenticated
  using (
    exists (select 1 from public.week_plans wp where wp.id = week_plan_id and wp.coach_id = auth.uid())
  );

-- PLANNED_EXERCISES — gated by parent session -> plan
create policy "Exercises visible if parent session visible"
  on public.planned_exercises for select to authenticated
  using (
    exists (
      select 1 from public.planned_sessions ps
      join public.week_plans wp on wp.id = ps.week_plan_id
      where ps.id = planned_session_id
        and (wp.coach_id = auth.uid() or (wp.athlete_id = auth.uid() and wp.status = 'published'))
    )
  );

create policy "Coach manages exercises of own plans (insert)"
  on public.planned_exercises for insert to authenticated
  with check (
    exists (
      select 1 from public.planned_sessions ps
      join public.week_plans wp on wp.id = ps.week_plan_id
      where ps.id = planned_session_id and wp.coach_id = auth.uid()
    )
  );

create policy "Coach manages exercises of own plans (update)"
  on public.planned_exercises for update to authenticated
  using (
    exists (
      select 1 from public.planned_sessions ps
      join public.week_plans wp on wp.id = ps.week_plan_id
      where ps.id = planned_session_id and wp.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.planned_sessions ps
      join public.week_plans wp on wp.id = ps.week_plan_id
      where ps.id = planned_session_id and wp.coach_id = auth.uid()
    )
  );

create policy "Coach manages exercises of own plans (delete)"
  on public.planned_exercises for delete to authenticated
  using (
    exists (
      select 1 from public.planned_sessions ps
      join public.week_plans wp on wp.id = ps.week_plan_id
      where ps.id = planned_session_id and wp.coach_id = auth.uid()
    )
  );

-- PLAN_TEMPLATES (coach-private)
create policy "Coach can view own templates"
  on public.plan_templates for select to authenticated
  using (coach_id = auth.uid());

create policy "Coach can manage own templates (insert)"
  on public.plan_templates for insert to authenticated
  with check (coach_id = auth.uid() and public.has_role(auth.uid(), 'coach'));

create policy "Coach can manage own templates (update)"
  on public.plan_templates for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy "Coach can manage own templates (delete)"
  on public.plan_templates for delete to authenticated
  using (coach_id = auth.uid());

create policy "Template sessions visible to owner"
  on public.plan_template_sessions for select to authenticated
  using (exists (select 1 from public.plan_templates t where t.id = template_id and t.coach_id = auth.uid()));

create policy "Template sessions managed by owner (insert)"
  on public.plan_template_sessions for insert to authenticated
  with check (exists (select 1 from public.plan_templates t where t.id = template_id and t.coach_id = auth.uid()));

create policy "Template sessions managed by owner (update)"
  on public.plan_template_sessions for update to authenticated
  using (exists (select 1 from public.plan_templates t where t.id = template_id and t.coach_id = auth.uid()))
  with check (exists (select 1 from public.plan_templates t where t.id = template_id and t.coach_id = auth.uid()));

create policy "Template sessions managed by owner (delete)"
  on public.plan_template_sessions for delete to authenticated
  using (exists (select 1 from public.plan_templates t where t.id = template_id and t.coach_id = auth.uid()));

create policy "Template exercises visible to owner"
  on public.plan_template_exercises for select to authenticated
  using (exists (
    select 1 from public.plan_template_sessions s
    join public.plan_templates t on t.id = s.template_id
    where s.id = template_session_id and t.coach_id = auth.uid()
  ));

create policy "Template exercises managed by owner (insert)"
  on public.plan_template_exercises for insert to authenticated
  with check (exists (
    select 1 from public.plan_template_sessions s
    join public.plan_templates t on t.id = s.template_id
    where s.id = template_session_id and t.coach_id = auth.uid()
  ));

create policy "Template exercises managed by owner (update)"
  on public.plan_template_exercises for update to authenticated
  using (exists (
    select 1 from public.plan_template_sessions s
    join public.plan_templates t on t.id = s.template_id
    where s.id = template_session_id and t.coach_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plan_template_sessions s
    join public.plan_templates t on t.id = s.template_id
    where s.id = template_session_id and t.coach_id = auth.uid()
  ));

create policy "Template exercises managed by owner (delete)"
  on public.plan_template_exercises for delete to authenticated
  using (exists (
    select 1 from public.plan_template_sessions s
    join public.plan_templates t on t.id = s.template_id
    where s.id = template_session_id and t.coach_id = auth.uid()
  ));
