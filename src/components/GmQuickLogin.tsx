import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { gmLogin } from "@/lib/gm-auth.functions";

/**
 * Small floating dispatch box: lets a game-master sign in from any page so the
 * figures on the register and dossiers become directly editable in place.
 */
export function GmQuickLogin() {
  const { isGm, loading } = useSession();
  const login = useServerFn(gmLogin);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;

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
      setOpen(false);
      setUsername("");
      setPassword("");
      toast.success("Game-master editing enabled — figures are now amendable in place");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 print:hidden">
      {open && !isGm && (
        <form
          onSubmit={submit}
          className="w-64 space-y-2 rounded border border-primary/40 bg-card p-3 shadow-[0_0_24px_hsl(var(--primary)/0.25)]"
        >
          <div className="rule-label">Bureau dispatch box</div>
          <input
            required
            autoComplete="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <input
            required
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-primary px-2 py-1.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Enable live editing"}
          </button>
        </form>
      )}
      {isGm ? (
        <div className="flex items-center gap-2 rounded border border-primary/50 bg-card px-3 py-1.5 text-xs uppercase tracking-widest text-primary">
          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
          GM live edit
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              toast.success("Live editing disabled");
            }}
            className="text-muted-foreground hover:text-destructive"
            title="Sign out"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded border border-border bg-card px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
        >
          {open ? "Close" : "GM"}
        </button>
      )}
    </div>
  );
}
