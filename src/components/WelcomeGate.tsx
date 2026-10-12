import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { gmLogin } from "@/lib/gm-auth.functions";

const ENTERED_KEY = "bureau_entered";

/**
 * Full-screen entry gate shown the moment the document is opened, before any
 * page content. A game-master signs in here directly; everyone else opens as
 * a guest below. Reappears each new browser session (a fresh tab / after
 * closing the browser), same as walking back up to the front desk.
 */
export function WelcomeGate() {
  const { session, isGm, loading } = useSession();
  const login = useServerFn(gmLogin);
  const [entered, setEntered] = useState(true); // default true to avoid a flash before the effect runs
  const [hydrated, setHydrated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const already = sessionStorage.getItem(ENTERED_KEY) === "1";
    setEntered(already);
    setHydrated(true);
  }, []);

  // Once signed in (GM or otherwise) or once a session already exists, treat the doc as entered.
  useEffect(() => {
    if (session) {
      sessionStorage.setItem(ENTERED_KEY, "1");
      setEntered(true);
    }
  }, [session]);

  function enterAsGuest() {
    sessionStorage.setItem(ENTERED_KEY, "1");
    setEntered(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await login({ data: { username, password } });
      if (!result.ok) {
        toast.error("Credentials rejected");
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      sessionStorage.setItem(ENTERED_KEY, "1");
      setEntered(true);
      toast.success("Game-master credentials accepted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  // Nothing to gate: not hydrated yet (avoid flashing on the server), already
  // entered this session, or a session already exists (GM or otherwise).
  if (!hydrated || entered || loading || session || isGm) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded border border-border bg-card p-6 shadow-[0_0_40px_hsl(var(--primary)/0.15)]">
        <div className="rule-label">Bureau of Interstellar Statistics</div>
        <h1 className="mb-4 mt-2 text-2xl font-bold text-primary">Access</h1>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="rule-label">Username</span>
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="rule-label">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Enter as Game Master"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="rule-label">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={enterAsGuest}
          className="w-full rounded border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary"
        >
          Open as Guest
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          A single game-master credential is issued by the Bureau. No registration.
        </p>
      </div>
    </div>
  );
}
