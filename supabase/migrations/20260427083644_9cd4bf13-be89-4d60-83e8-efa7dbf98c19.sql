CREATE POLICY "Users can self-grant athlete role"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'athlete'::app_role);

CREATE POLICY "Users can drop their own athlete role"
  ON public.user_roles FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND role = 'athlete'::app_role);
