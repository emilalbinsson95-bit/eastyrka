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

export type AppRole = "coach" | "athlete";

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
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
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return null;
  // Coach takes priority if a user somehow has both
  if (data.some((r) => r.role === "coach")) return "coach";
  return "athlete";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: subscribe FIRST, then read existing session.
  useEffect(() => {
    let unsubscribed = false;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (unsubscribed) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer role fetch off the auth callback to avoid deadlocks
        setTimeout(() => {
          fetchRole(newSession.user.id).then((r) => {
            if (!unsubscribed) setRole(r);
          });
        }, 0);
      } else {
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (unsubscribed) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchRole(data.session.user.id).then((r) => {
          if (!unsubscribed) {
            setRole(r);
            setLoading(false);
          }
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/today` : undefined,
          data: { full_name: fullName },
        },
      });
      if (error) return { error: error.message };

      // Trigger creates default 'athlete' role. If user signed up as coach,
      // upgrade their role row.
      if (signupRole === "coach" && data.user) {
        await supabase
          .from("user_roles")
          .upsert(
            { user_id: data.user.id, role: "coach" },
            { onConflict: "user_id,role" },
          );
        // Remove the auto-created athlete row so login redirects to coach UI.
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", data.user.id)
          .eq("role", "athlete");
      }
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user) return;
    const r = await fetchRole(user.id);
    setRole(r);
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({ user, session, role, loading, signIn, signUp, signOut, refreshRole }),
    [user, session, role, loading, signIn, signUp, signOut, refreshRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
