import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "coach" | "athlete" | "physio" | "patient";

const ALL_ROLES: AppRole[] = ["coach", "athlete", "physio", "patient"];

const VIEW_MODE_KEY = "ea-view-mode";

interface AuthState {
  user: User | null;
  session: Session | null;
  /** The currently active view (coach or athlete). Coaches with both roles can switch. */
  role: AppRole | null;
  /** All roles the user actually holds (one or both). */
  roles: AppRole[];
  /** True when the user holds the coach role, regardless of current view. */
  isCoach: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
  /** Switch the active view (only effective if the user holds both roles). */
  setViewMode: (view: AppRole) => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data) return [];
  const set = new Set<AppRole>();
  for (const r of data) {
    if ((ALL_ROLES as string[]).includes(r.role)) set.add(r.role as AppRole);
  }
  return Array.from(set);
}

function readStoredView(): AppRole | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(VIEW_MODE_KEY);
  return (ALL_ROLES as string[]).includes(v ?? "") ? (v as AppRole) : null;
}

function pickActiveRole(
  roles: AppRole[],
  storedView: AppRole | null,
): AppRole | null {
  if (roles.length === 0) return null;
  if (storedView && roles.includes(storedView)) return storedView;
  // Default priority: coach → physio → athlete → patient
  for (const r of ["coach", "physio", "athlete", "patient"] as AppRole[]) {
    if (roles.includes(r)) return r;
  }
  return roles[0];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [view, setView] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: subscribe FIRST, then read existing session.
  // Dedupe role fetches: a single getSession + INITIAL_SESSION event would
  // otherwise fire two identical user_roles queries on every page load.
  useEffect(() => {
    let unsubscribed = false;
    let lastFetchedUserId: string | null = null;
    let inFlight: Promise<AppRole[]> | null = null;

    const applyRoles = (next: AppRole[]) => {
      if (unsubscribed) return;
      setRoles(next);
      setView((prev) => pickActiveRole(next, prev ?? readStoredView()));
    };

    const loadRoles = (userId: string) => {
      if (lastFetchedUserId === userId && inFlight) return inFlight;
      lastFetchedUserId = userId;
      inFlight = fetchRoles(userId);
      return inFlight;
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (unsubscribed) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Skip duplicate role fetches across getSession / INITIAL_SESSION /
        // TOKEN_REFRESHED events for the same user.
        if (event === "TOKEN_REFRESHED" && lastFetchedUserId === newSession.user.id) {
          return;
        }
        setTimeout(() => {
          loadRoles(newSession.user.id).then(applyRoles);
        }, 0);
      } else {
        lastFetchedUserId = null;
        inFlight = null;
        setRoles([]);
        setView(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (unsubscribed) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadRoles(data.session.user.id).then((next) => {
          if (unsubscribed) return;
          applyRoles(next);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      unsubscribed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback<AuthState["signIn"]>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback<AuthState["signUp"]>(
    async (email, password, fullName, signupRole) => {
      // The selected role is passed in user metadata and read by the
      // `handle_new_user` database trigger, which assigns the matching
      // row in public.user_roles. Doing it server-side avoids the RLS
      // race that exists before a session is established (especially
      // with email confirmation enabled).
      const redirectTarget =
        signupRole === "coach"
          ? "/coach"
          : signupRole === "physio"
            ? "/physio"
            : signupRole === "patient"
              ? "/patient"
              : "/today";
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}${redirectTarget}`
              : undefined,
          data: { full_name: fullName, role: signupRole },
        },
      });
      if (error) return { error: error.message };
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRoles([]);
    setView(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(VIEW_MODE_KEY);
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user) return;
    const next = await fetchRoles(user.id);
    setRoles(next);
    setView((prev) => pickActiveRole(next, prev ?? readStoredView()));
  }, [user]);

  const setViewMode = useCallback(
    (next: AppRole) => {
      if (!roles.includes(next)) return;
      setView(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(VIEW_MODE_KEY, next);
      }
    },
    [roles],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      session,
      role: view,
      roles,
      isCoach: roles.includes("coach"),
      loading,
      signIn,
      signUp,
      signOut,
      refreshRole,
      setViewMode,
    }),
    [user, session, view, roles, loading, signIn, signUp, signOut, refreshRole, setViewMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
