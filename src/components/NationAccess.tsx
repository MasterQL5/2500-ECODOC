import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { verifyNationCode } from "@/lib/nation.functions";

/** What the dossier knows about the visitor's ministerial access: `code` is only set once the
 * server has accepted it, and is what every filing is sent with. */
export type NationAccess = { unlocked: boolean; code: string };

export const LOCKED: NationAccess = { unlocked: false, code: "" };

/**
 * The one place a visitor enters their state's access code. Everything on the dossier is readable
 * by anyone; this bar is what turns the editing controls on, on every tab at once. The code is
 * held in memory only, so closing the page or pressing "Lock" drops it.
 */
export function AccessBar({
  acronym,
  access,
  onChange,
}: {
  acronym: string;
  access: NationAccess;
  onChange: (next: NationAccess) => void;
}) {
  const verify = useServerFn(verifyNationCode);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      await verify({ data: { acronym, code: draft } });
      onChange({ unlocked: true, code: draft });
      setDraft("");
      toast.success("Ministerial access granted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Access code rejected");
    } finally {
      setBusy(false);
    }
  }

  if (access.unlocked) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-primary/40 bg-card px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span aria-hidden>🔓</span>
          <span className="rule-label text-primary">Ministerial access</span>
          <span className="text-xs text-muted-foreground">
            You can amend {acronym}'s information, expenditures and Bureau variables on every tab.
          </span>
        </div>
        <button
          onClick={() => onChange(LOCKED)}
          className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
        >
          Lock
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={unlock}
      className="mb-4 flex flex-wrap items-center gap-3 rounded border border-dashed border-border bg-card px-4 py-2.5"
    >
      <div className="flex min-w-[220px] flex-1 items-center gap-2">
        <span aria-hidden>🔒</span>
        <span className="text-xs text-muted-foreground">
          Everything here is public. Enter the access code to amend this state's books.
        </span>
      </div>
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Access code"
        autoComplete="off"
        className="w-48 rounded border border-border bg-background px-3 py-1.5 text-sm"
      />
      <button
        disabled={busy || !draft}
        className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
      >
        Unlock
      </button>
    </form>
  );
}
