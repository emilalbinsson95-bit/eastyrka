/** Non-destructive archive: keep roles and records, disable app entry points. */
export const ARCHIVED_ROLES = ["patient", "physio"] as const;

export function isArchivedRole(role: string | null | undefined): boolean {
  return ARCHIVED_ROLES.some((archived) => archived === role);
}

export function isArchivedPath(pathname: string): boolean {
  return ARCHIVED_ROLES.some((role) =>
    pathname === `/${role}` || pathname.startsWith(`/${role}/`),
  );
}

export function pickAvailableRole<T extends string>(roles: T[], stored: T | null): T | null {
  const available = roles.filter((role) => !isArchivedRole(role));
  if (stored && available.includes(stored)) return stored;
  for (const preferred of ["coach", "athlete", "admin"]) {
    const role = available.find((candidate) => candidate === preferred);
    if (role) return role;
  }
  // Archived-only accounts retain their identity and open the archive notice.
  return available[0] ?? roles[0] ?? null;
}