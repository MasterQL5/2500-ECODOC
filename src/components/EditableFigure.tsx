import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { fmtValue, valueTone, type FieldFormat } from "@/lib/econ";

type Props = {
  table: "nations" | "commodities";
  invalidateKey: string;
  id: string;
  field: string;
  value: unknown;
  format: FieldFormat;
  currency?: string;
  className?: string;
};

/**
 * A single registered figure. Ordinary readers see the formatted value; a
 * signed-in game-master can click it and amend it directly on the sheet.
 */
export function EditableFigure({
  table,
  invalidateKey,
  id,
  field,
  value,
  format,
  currency = "C$",
  className = "",
}: Props) {
  const { isGm } = useSession();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const tone = valueTone(field, value);
  const text = fmtValue(value, format, currency);

  if (!isGm) {
    return <span className={`${tone} ${className}`}>{text}</span>;
  }

  async function save() {
    setBusy(true);
    const next =
      draft.trim() === "" ? null : format === "text" ? draft.trim() : Number(draft);
    if (typeof next === "number" && !Number.isFinite(next)) {
      toast.error("That is not a number the Bureau recognises");
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from(table)
      .update({ [field]: next } as never)
      .eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: [invalidateKey] });
    setEditing(false);
    toast.success("Figure amended");
  }

  if (editing) {
    return (
      <input
        autoFocus
        disabled={busy}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="tabular w-28 rounded border border-primary bg-background px-1 py-0.5 text-right text-xs"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value === null || value === undefined ? "" : String(value));
        setEditing(true);
      }}
      title="Amend this figure"
      className={`rounded px-1 underline decoration-dotted decoration-primary/60 underline-offset-2 hover:bg-primary/10 ${tone} ${className}`}
    >
      {text}
    </button>
  );
}
