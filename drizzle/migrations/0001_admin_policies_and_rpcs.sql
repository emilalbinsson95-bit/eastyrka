-- Admins can read all role rows
CREATE POLICY "Admins can read all user_roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can grant roles
CREATE POLICY "Admins can insert user_roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can revoke roles
CREATE POLICY "Admins can delete user_roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- List users with their roles (admin only). Returns id, name, email, roles.
CREATE OR REPLACE FUNCTION public.admin_list_users(_query text DEFAULT NULL)
RETURNS TABLE(id uuid, full_name text, email text, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, u.email::text,
         COALESCE(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), '{}')
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_roles r ON r.user_id = u.id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (_query IS NULL OR p.full_name ILIKE '%' || _query || '%' OR u.email ILIKE '%' || _query || '%')
  GROUP BY p.id, p.full_name, u.email
  ORDER BY p.full_name
  LIMIT 50
$$;

-- Grant a role to a user (admin only; admin role itself excluded)
CREATE OR REPLACE FUNCTION public.admin_grant_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _role = 'admin' THEN
    RAISE EXCEPTION 'Admin role cannot be granted here';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Revoke a role from a user (admin only; admin role itself excluded)
CREATE OR REPLACE FUNCTION public.admin_revoke_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _role = 'admin' THEN
    RAISE EXCEPTION 'Admin role cannot be revoked here';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
END;
$$;