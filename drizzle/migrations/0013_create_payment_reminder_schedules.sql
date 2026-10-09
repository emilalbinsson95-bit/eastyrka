CREATE TABLE public.payment_reminder_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 athlete_id uuid NOT NULL UNIQUE,
 service text NOT NULL CHECK (service IN ('coaching', 'overview')),
 start_date date NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_reminder_schedules TO authenticated;
GRANT ALL ON public.payment_reminder_schedules TO service_role;
ALTER TABLE public.payment_reminder_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_reminders_read ON public.payment_reminder_schedules FOR SELECT TO authenticated USING (athlete_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.is_coach_of(auth.uid(), athlete_id));
CREATE POLICY payment_reminders_insert ON public.payment_reminder_schedules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY payment_reminders_update ON public.payment_reminder_schedules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY payment_reminders_delete ON public.payment_reminder_schedules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
