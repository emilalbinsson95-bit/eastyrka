CREATE TABLE public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  comp_date date NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes manage own competitions"
ON public.competitions FOR ALL TO authenticated
USING (auth.uid() = athlete_id)
WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Coaches manage their athletes' competitions"
ON public.competitions FOR ALL TO authenticated
USING (public.is_coach_of(auth.uid(), athlete_id))
WITH CHECK (public.is_coach_of(auth.uid(), athlete_id));

CREATE TRIGGER set_competitions_updated_at BEFORE UPDATE ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();