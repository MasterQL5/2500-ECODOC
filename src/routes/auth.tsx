import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BureauShell } from "@/components/BureauShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { gmLogin } from "@/lib/gm-auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Bureau Sign-in — Game Master Access" },
      {
        name: "description",
        content: "Sign in to administer the exchange register and national accounts.",
      },
      { property: "og:title", content: "Bureau Sign-in — Game Master Access" },
      { property: "og:description", content: "Authorised personnel only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, isGm } = useSession();
  const login = useServerFn(gmLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

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
      toast.success("Game-master credentials accepted");
      navigate({ to: "/gm" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BureauShell>
      <div className="mx-auto max-w-md rounded border border-border bg-card p-6">
        <div className="rule-label">Restricted</div>
        <h1 className="mb-4 mt-2 text-2xl font-bold text-primary">Bureau access</h1>

        {user ? (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Signed in. {isGm ? "Game-master privileges active." : "No GM role assigned."}
            </p>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                toast.success("Signed out");
              }}
              className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        ) : (
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
              {busy ? "Verifying…" : "Enter"}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              A single game-master credential is issued by the Bureau. No registration.
            </p>
          </form>
        )}
      </div>
    </BureauShell>
  );
}
