import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { FORMULA_LOCKED_FIELDS, fmtValue, valueTone, type FieldFormat } from "@/lib/econ";

type Props = {
  table: "nations";
  invalidateKey: string;
  id: string;
  field: string;
  value: unknown;
  format: FieldFormat;
  currency?: string;
  className?: string;
};

/** Fields whose real value is always derived from the tax-formula ledger and should never be
 * hand-typed anywhere — otherwise a manual edit silently detaches the figure from the formulas
 * that are supposed to govern it (including a blank overwriting it back to nothing). These only
 * ever change via the Formula Workbench (on save) or a full year-advance. Imported from econ.ts
 * so this and NUMERIC_NATION_FIELDS never drift out of sync with each other. */

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
  // Subscribing here (even though `mode` itself isn't used directly) is what makes this
  // component's fmtValue() call actually re-run when the number-format toggle changes — without
  // it, toggling the display mode only updates a plain module variable that nothing tells React
  // to notice, so every already-rendered number stays stale until something else re-renders it.
  useNumberDisplay();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = FORMULA_LOCKED_FIELDS.has(field);

  const tone = valueTone(field, value);
  const text = fmtValue(value, format, currency);

  if (locked) {
    return (
      <span
        className={`${tone} ${className}`}
        title={
          field === "gdp_per_capita"
            ? "Calculated live: nominal GDP ÷ population"
            : field === "gdp_real"
              ? "Calculated live: nominal GDP ÷ (1 + inflation ratio)"
              : field === "gdp_ppp"
                ? "Calculated live: nominal GDP × PPP conversion rate"
                : "Derived from the tax-formula ledger — edit formulas or Bureau variables in the Formula Workbench to change this"
        }
      >
        {text}
      </span>
    );
  }

  if (!isGm) {
    return <span className={`${tone} ${className}`}>{text}</span>;
  }

  async function save() {
    setBusy(true);
    let next: string | number | null =
      draft.trim() === "" ? null : format === "text" ? draft.trim() : Number(draft);
    if (typeof next === "number" && !Number.isFinite(next)) {
      toast.error("That is not a number the Bureau recognises");
      setBusy(false);
      return;
    }
    if (typeof next === "number" && format === "population") next = Math.ceil(next);
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
