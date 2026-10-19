import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import type { CreditTier } from "@/lib/debt";

/**
 * Shows a nation's current credit tier (its cosmetic name) and, for a signed-in GM, lets it be
 * changed from a dropdown of the live tiers — same click-to-edit feel as an ordinary
 * EditableFigure cell, but backed by a real relationship (nations.credit_tier_id) rather than
 * free text, so it can never drift out of sync with the tier the interest system actually uses.
 */
export function CreditTierFigure({
  nationId,
  tierId,
  tiers,
  className = "",
}: {
  nationId: string;
  tierId: string | null | undefined;
  tiers: CreditTier[];
  className?: string;
}) {
  const { isGm } = useSession();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = tiers.find((t) => t.id === tierId);
  const text = current?.name ?? "—";

  if (!isGm) {
    return <span className={className}>{text}</span>;
  }

  async function save(newTierId: string) {
    setBusy(true);
    const newTier = tiers.find((t) => t.id === newTierId);
    const { error } = await supabase
      .from("nations")
      .update({
        credit_tier_id: newTierId,
        // Mirrored as plain text too, so places that just read credit_rating as a display
        // string (the homepage leaderboard, the world map) show the current tier name without
        // needing their own tier lookup.
        credit_rating: newTier?.name ?? null,
      } as never)
      .eq("id", nationId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["nations"] });
    setEditing(false);
    toast.success("Credit tier amended");
  }

  if (editing) {
    return (
      <select
        autoFocus
        disabled={busy}
        defaultValue={tierId ?? ""}
        onChange={(e) => save(e.target.value)}
        onBlur={() => setEditing(false)}
        className="w-28 rounded border border-primary bg-background px-1 py-0.5 text-xs"
      >
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Amend this state's credit tier"
      className={`rounded px-1 underline decoration-dotted decoration-primary/60 underline-offset-2 hover:bg-primary/10 ${className}`}
    >
      {text}
    </button>
  );
}
