import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type SessionState = {
  session: Session | null;
  user: Session["user"] | null;
  isGm: boolean;
  loading: boolean;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * Fetches the auth session and GM role exactly once for the whole app and
 * shares it via context, instead of every component that calls useSession()
 * running its own auth listener and its own "am I GM" database round-trip.
 * That duplication was the source of the visible delay when opening the GM
 * panel or navigating between pages.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGm, setIsGm] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    let lastUserId: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const nextUserId = next?.user?.id ?? null;
      if (nextUserId !== lastUserId) {
        // Only reset the role check when the signed-in user actually changes — Supabase fires
        // this callback on token refreshes and tab-focus events too, not just real sign-ins/
        // sign-outs, and resetting roleChecked on every one of those (without the user id
        // actually changing) left loading stuck true forever, since nothing re-ran the role
        // lookup to flip it back.
        lastUserId = nextUserId;
        if (!nextUserId) {
          setIsGm(false);
          setRoleChecked(true);
        } else {
          setRoleChecked(false);
        }
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      lastUserId = data.session?.user?.id ?? null;
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setIsGm(false);
      setRoleChecked(true);
      return;
    }
    let active = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "gm")
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setIsGm(Boolean(data));
        setRoleChecked(true);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  // Keep `loading` true until the role check has also settled, so consumers never see a
  // false "not GM" flash between the session resolving and the role finishing its lookup.
  const value = useMemo<SessionState>(
    () => ({
      session,
      user: session?.user ?? null,
      isGm,
      loading: loading || (Boolean(session?.user) && !roleChecked),
    }),
    [session, isGm, loading, roleChecked],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider (mounted in __root.tsx)");
  }
  return ctx;
}
