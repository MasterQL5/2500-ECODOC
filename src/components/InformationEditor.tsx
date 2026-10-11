import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { Nation } from "@/lib/econ";
import { DEFAULT_INFO_ROWS } from "@/lib/econ";
import { setNationInformation, updateNationProfile } from "@/lib/nation.functions";
import { useFiling } from "@/hooks/useFiling";
import type { NationAccess } from "@/components/NationAccess";

type InfoRow = { label: string; value: string };

/**
 * The editing half of the INFORMATION tab: registry particulars (name, currency, flag) and the
 * public information sheet. Only mounted once the visitor has unlocked the state.
 */
export function InformationEditor({ nation, access }: { nation: Nation; access: NationAccess }) {
  const qc = useQueryClient();
  const updateProfile = useServerFn(updateNationProfile);
  const saveInformation = useServerFn(setNationInformation);
  const { busy, run } = useFiling();
  const code = access.code;

  const [name, setName] = useState(nation.name);
  const [currencyName, setCurrencyName] = useState(nation.currency_name ?? "");
  const [currencySymbol, setCurrencySymbol] = useState(nation.currency_symbol ?? "");
  const [summary, setSummary] = useState(nation.summary ?? "");
  const [infoRows, setInfoRows] = useState<InfoRow[]>(() =>
    nation.info_rows && nation.info_rows.length > 0 ? nation.info_rows : DEFAULT_INFO_ROWS,
  );
  const [draggedInfoRow, setDraggedInfoRow] = useState<number | null>(null);
  const [flagUrl, setFlagUrl] = useState<string | null>(nation.flag_url ?? null);

  const saveProfile = () =>
    run(async () => {
      await updateProfile({
        data: {
          acronym: nation.acronym,
          code,
          name,
          currency_name: currencyName,
          currency_symbol: currencySymbol,
        },
      });
      await qc.invalidateQueries({ queryKey: ["currencies"] });
      await qc.invalidateQueries({ queryKey: ["nations"] });
    }, "Registry amended");

  const commitInformation = () =>
    run(async () => {
      await saveInformation({
        data: { acronym: nation.acronym, code, summary, rows: infoRows, flag_url: flagUrl },
      });
      await qc.invalidateQueries({ queryKey: ["nations"] });
    }, "Information filed");

  async function onFlagFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) {
      toast.error("Flag image too large — keep it under 500 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFlagUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <section className="mt-4 space-y-4 rounded border border-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-primary">Amend information — {nation.acronym}</h2>
        <span className="rule-label">Ministerial access</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded border border-border p-3">
          <h3 className="rule-label">Registry particulars</h3>
          <Field label="State name" value={name} onChange={setName} />
          <Field label="Currency name" value={currencyName} onChange={setCurrencyName} />
          <Field
            label="Currency symbol"
            value={currencySymbol}
            onChange={setCurrencySymbol}
            placeholder="e.g. ℘"
          />
          <p className="text-[11px] text-muted-foreground">
            Changing either currency field updates the Currency Exchange Register immediately, along
            with every other state sharing this currency bloc.
          </p>
          <div className="text-sm">
            <span className="rule-label">Flag image (PNG/JPEG, max 500 KB)</span>
            <div className="mt-1 flex items-center gap-3">
              {flagUrl && (
                <img
                  src={flagUrl}
                  alt={`Flag of ${nation.name}`}
                  className="h-8 w-12 border border-border object-cover"
                />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => onFlagFile(e.target.files?.[0])}
                className="text-xs"
              />
              {flagUrl && (
                <button
                  onClick={() => setFlagUrl(null)}
                  className="rounded border border-destructive/50 px-2 py-0.5 text-xs text-destructive"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              The flag is filed together with the information sheet.
            </p>
          </div>
          <button
            onClick={saveProfile}
            disabled={busy}
            className="mt-2 w-full rounded border border-primary/50 px-3 py-2 text-sm text-primary disabled:opacity-60"
          >
            Save particulars
          </button>
        </div>

        <div className="space-y-2 rounded border border-border p-3">
          <h3 className="rule-label">Public information sheet</h3>
          <label className="block text-sm">
            <span className="rule-label">General summary (shown under the state's name)</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <div className="space-y-1">
            {infoRows.map((row, i) => (
              <div
                key={i}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedInfoRow(i);
                }}
                onDragEnd={() => setDraggedInfoRow(null)}
                onDragOver={(e) => {
                  if (draggedInfoRow === null || draggedInfoRow === i) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedInfoRow === null || draggedInfoRow === i) return;
                  const reordered = [...infoRows];
                  const [moved] = reordered.splice(draggedInfoRow, 1);
                  if (!moved) return;
                  reordered.splice(i, 0, moved);
                  setInfoRows(reordered);
                  setDraggedInfoRow(null);
                }}
                className={`flex items-center gap-2 rounded ${draggedInfoRow === i ? "opacity-40" : ""}`}
              >
                <span
                  className="cursor-grab select-none text-muted-foreground"
                  title="Drag to reorder"
                >
                  ⠿
                </span>
                <input
                  value={row.label}
                  onChange={(e) =>
                    setInfoRows(
                      infoRows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)),
                    )
                  }
                  className="w-40 rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <input
                  value={row.value}
                  onChange={(e) =>
                    setInfoRows(
                      infoRows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                    )
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <button
                  onClick={() => setInfoRows(infoRows.filter((_, j) => j !== i))}
                  className="rounded border border-destructive/50 px-2 text-xs text-destructive"
                  aria-label="Remove row"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Drag the ⠿ handle to reorder how these appear on the public nation page. Paste a link
            directly, or write <code>[link text](https://...)</code> to show custom text instead of
            the raw URL.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setInfoRows([...infoRows, { label: "New entry", value: "" }])}
              className="rounded border border-primary/50 px-3 py-1 text-sm text-primary"
            >
              + Add row
            </button>
            <button
              onClick={commitInformation}
              disabled={busy}
              className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            >
              File information
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="rule-label">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
      />
    </label>
  );
}
