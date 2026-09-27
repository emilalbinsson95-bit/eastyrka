# Roadmap

## Admin role for Emil (in progress)
- [ ] Add `admin` to `app_role` enum + grant it to emil.albinsson95@gmail.com
- [ ] RLS: admins can read/insert/delete `user_roles` for all users
- [ ] Security-definer RPCs: list users with roles, grant/revoke roles (admin-only)
- [ ] Admin page `/coach/admin`: search users, toggle coach/athlete/physio/patient roles
- [ ] Nav link visible only to admins; verify build + live check
