-- 1) Extend role enum to include physio + patient
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'physio';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'patient';