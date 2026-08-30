import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type AuthState = {
  loading: boolean;
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Listener FIRST (per Supabase guidance)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession?.user) {
        setRole(null);
        setLoading(false);
      } else {
        setLoading(true);
        // Defer role fetch to avoid deadlocks in the listener
        setTimeout(() => {
          if (!mounted) return;
          void fetchRoleSafe(newSession.user).then((r) => {
            if (!mounted) return;
            setRole(r);
            setLoading(false);
          });
        }, 0);
      }
    });

    withTimeout(supabase.auth.getSession(), 8000, "Supabase session lookup timed out")
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          void fetchRoleSafe(data.session.user).then((r) => {
            if (!mounted) return;
            setRole(r);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load session", error);
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setRole(null);
        setLoading(false);
      });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      session,
      role,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, user, session, role],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function metadataRole(user: User): AppRole | null {
  const role = user.user_metadata?.role;
  return role === "doctor" || role === "patient" || role === "staff" || role === "admin"
    ? role
    : null;
}

async function fetchRole(user: User): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Failed to load role", error);
    return metadataRole(user);
  }
  return (data?.role as AppRole) ?? metadataRole(user);
}

async function fetchRoleSafe(user: User): Promise<AppRole | null> {
  try {
    return await withTimeout(fetchRole(user), 6000, "Role lookup timed out");
  } catch (error) {
    console.error("Failed to resolve role", error);
    return metadataRole(user);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
