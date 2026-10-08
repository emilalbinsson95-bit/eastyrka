CREATE TABLE public.coaching_availability (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  coaching_places integer NOT NULL DEFAULT 5 CHECK (coaching_places BETWEEN 0 AND 10000),
  overview_places integer NOT NULL DEFAULT 10 CHECK (overview_places BETWEEN 0 AND 10000)
);
GRANT SELECT ON public.coaching_availability TO anon, authenticated;
GRANT INSERT, UPDATE ON public.coaching_availability TO authenticated;
GRANT ALL ON public.coaching_availability TO service_role;
ALTER TABLE public.coaching_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read coaching availability" ON public.coaching_availability FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert coaching availability" ON public.coaching_availability FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update coaching availability" ON public.coaching_availability FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));