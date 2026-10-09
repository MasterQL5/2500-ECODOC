import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { Nation } from "@/lib/econ";
import { DEFAULT_INFO_ROWS, fmtCompact, fmtFull } from "@/lib/econ";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { expenditureBreakdown } from "@/lib/fiscal";
import { taxFormulasQuery } from "@/lib/queries";
import {
  buildContext,
  describeTokens,
  evalTokens,
  labelsFor,
  tokenVariables,
  visibleFieldsOf,
} from "@/lib/formula";
import {
  setNationCustomVariables,
  setNationExpenditureItems,
  setNationInformation,
  updateNationProfile,
  verifyNationCode,
} from "@/lib/nation.functions";
import { NumberField } from "@/components/NumberField";

type ExpRow = { label: string; amount: number };
type InfoRow = { label: string; value: string };

export function NationInternalPanel({
  nation,
  currency,
  formula,
}: {
  nation: Nation;
  currency: string;
  formula: Record<string, number>;
}) {
  const qc = useQueryClient();
  useNumberDisplay(); // subscribe so toggling short/full numbers re-renders this panel's figures
  const verify = useServerFn(verifyNationCode);
  const updateProfile = useServerFn(updateNationProfile);
  const saveExpenditures = useServerFn(setNationExpenditureItems);
  const saveInformation = useServerFn(setNationInformation);
  const saveCustomVars = useServerFn(setNationCustomVariables);

  const { data: allTaxes } = useSuspenseQuery(taxFormulasQuery);
  const taxes = allTaxes.filter((t) => t.nation_id === nation.id);

  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openTaxId, setOpenTaxId] = useState<string | null>(null);

  const ctx = buildContext(nation, formula);
  const taxValues = taxes.map((t) => ({ tax: t, value: evalTokens(t.tokens, ctx) }));
  const revTotal = taxValues.reduce((s, x) => s + x.value, 0);

  const [name, setName] = useState(nation.name);
  const [currencyName, setCurrencyName] = useState(nation.currency_name ?? "");
  const [currencySymbol, setCurrencySymbol] = useState(nation.currency_symbol ?? "");
  const [expRows, setExpRows] = useState<ExpRow[]>(() =>
    (nation.expenditure_items && nation.expenditure_items.length > 0
      ? expenditureBreakdown(nation, 0)
      : expenditureBreakdown(nation, nation.expenditures ?? 0)
    )
      .filter((e) => e.label !== "Interest payments")
      .map((e) => ({ label: e.label, amount: e.amount })),
  );
  const interestLine = (nation.expenditure_items ?? []).find(
    (e) => e.label === "Interest payments",
  );
  const [summary, setSummary] = useState(nation.summary ?? "");
  const [infoRows, setInfoRows] = useState<InfoRow[]>(() =>
    nation.info_rows && nation.info_rows.length > 0 ? nation.info_rows : DEFAULT_INFO_ROWS,
  );
  const [draggedInfoRow, setDraggedInfoRow] = useState<number | null>(null);
  const [flagUrl, setFlagUrl] = useState<string | null>(nation.flag_url ?? null);
  const visibleFields = visibleFieldsOf(nation);
  const fieldLabels = labelsFor(nation);
  const customVars = Array.from(visibleFields).map((key) => ({
    key,
    label: fieldLabels[key] ?? key.replace(/_/g, " "),
  }));
  const [customVarDraft, setCustomVarDraft] = useState<Record<string, number>>({});

  const expTotal =
    expRows.reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0) +
    (interestLine?.amount ?? 0);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verify({ data: { acronym: nation.acronym, code } });
      setUnlocked(true);
      toast.success("Ministerial access granted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Access code rejected");
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Filing refused");
    } finally {
      setBusy(false);
    }
  }

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

  const commitExpenditures = () =>
    run(async () => {
      const items = interestLine
        ? [...expRows, { label: interestLine.label, amount: interestLine.amount ?? 0 }]
        : expRows;
      await saveExpenditures({ data: { acronym: nation.acronym, code, items } });
      await qc.invalidateQueries({ queryKey: ["nations"] });
    }, "Estimates filed");

  const commitInformation = () =>
    run(async () => {
      await saveInformation({
        data: { acronym: nation.acronym, code, summary, rows: infoRows, flag_url: flagUrl },
      });
      await qc.invalidateQueries({ queryKey: ["nations"] });
    }, "Information filed");

  const commitCustomVars = () =>
    run(async () => {
      await saveCustomVars({ data: { acronym: nation.acronym, code, values: customVarDraft } });
      await qc.invalidateQueries({ queryKey: ["nations"] });
    }, "Variables filed");

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

  if (!unlocked) {
    return (
      <section className="mt-8 rounded border border-dashed border-border bg-card p-4">
        <h2 className="rule-label mb-2">Ministerial section — access code required</h2>
        <form onSubmit={unlock} className="flex flex-wrap gap-2">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            className="w-56 rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            Unlock treasury books
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-6 rounded border border-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-primary">Treasury books — {nation.acronym}</h2>
        <span className="rule-label">Ministerial access</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Figure label="Total revenue" value={fmtCompact(revTotal, currency)} />
        <Figure label="Total expenditure" value={fmtCompact(expTotal, currency)} />
        <Figure
          label={revTotal - expTotal >= 0 ? "Net surplus" : "Net deficit"}
          value={fmtCompact(revTotal - expTotal, currency)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-border p-3">
          <h3 className="rule-label mb-2">
            Revenues — select a line to inspect its formula and Bureau variables
          </h3>
          {taxValues.map(({ tax, value }) => (
            <div key={tax.id} className="border-b border-border/50">
              <button
                onClick={() => setOpenTaxId(openTaxId === tax.id ? null : tax.id)}
                className="flex w-full items-center justify-between py-1 text-left text-sm hover:text-primary"
              >
                <span className="text-muted-foreground">
                  {openTaxId === tax.id ? "▾" : "▸"} {tax.name}
                  {tax.source === "nation" && (
                    <span className="ml-2 rounded border border-accent/50 px-1 text-[10px] uppercase tracking-wider text-accent">
                      domestic
                    </span>
                  )}
                </span>
                <span className="tabular">{fmtCompact(value, currency)}</span>
              </button>
              {openTaxId === tax.id && (
                <div className="mb-2 space-y-2 rounded border border-border/60 bg-background/40 p-2 text-xs">
                  <div>
                    <div className="rule-label mb-1">Revenue logic (set by the Bureau)</div>
                    <p className="text-muted-foreground">{describeTokens(tax.tokens, ctx)}</p>
                    <p className="tabular mt-1 text-foreground">= {fmtCompact(value, currency)}</p>
                  </div>
                  {(() => {
                    const vars = tokenVariables(tax.tokens, ctx);
                    if (vars.length === 0) return null;
                    return (
                      <div>
                        <div className="rule-label mb-1">
                          Variables used by this tax (read only)
                        </div>
                        <div className="grid gap-x-4 sm:grid-cols-2">
                          {vars.map((v) => (
                            <div
                              key={`${v.kind}:${v.key}`}
                              className="flex justify-between border-b border-border/40 py-0.5"
                            >
                              <span className="text-muted-foreground">{v.label}</span>
                              <span className="tabular">{fmtFull(v.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}

          <p className="mt-3 rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
            Revenue lines and their formulas are set by the Bureau. Petition a game-master to add or
            strike a tax.
          </p>
        </div>

        <div className="rounded border border-border p-3">
          <h3 className="rule-label mb-2">Expenditures — every line may be renamed or revalued</h3>
          <div className="space-y-1">
            {expRows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={row.label}
                  onChange={(e) =>
                    setExpRows(
                      expRows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)),
                    )
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  step="any"
                  value={Number.isFinite(row.amount) ? row.amount : ""}
                  onChange={(e) =>
                    setExpRows(
                      expRows.map((r, j) =>
                        j === i ? { ...r, amount: Number(e.target.value) } : r,
                      ),
                    )
                  }
                  className="w-36 rounded border border-border bg-background px-2 py-1 text-right text-sm"
                />
                <button
                  onClick={() => setExpRows(expRows.filter((_, j) => j !== i))}
                  className="rounded border border-destructive/50 px-2 text-xs text-destructive"
                  aria-label="Remove expenditure"
                >
                  ×
                </button>
              </div>
            ))}
            {interestLine && (
              <div
                className="flex items-center gap-2 rounded border border-border/40 bg-secondary/30 px-2 py-1"
                title="Locked — derived from this state's debt instruments in the Formula Workbench's Debt & Credit tab"
              >
                <span className="flex-1 text-sm text-muted-foreground">{interestLine.label}</span>
                <span className="tabular w-36 text-right text-sm text-muted-foreground">
                  {fmtCompact(interestLine.amount ?? 0, currency)}
                </span>
                <span className="w-6 text-center text-xs text-muted-foreground" aria-hidden>
                  🔒
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setExpRows([...expRows, { label: "New expenditure", amount: 0 }])}
              className="rounded border border-primary/50 px-3 py-1 text-sm text-primary"
            >
              + Add line
            </button>
            <button
              onClick={commitExpenditures}
              disabled={busy}
              className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            >
              File estimates
            </button>
          </div>
        </div>
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
            Changing either field updates the Currency Exchange Register immediately, along with
            every other state sharing this currency bloc.
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
              The flag is filed together with the information sheet below.
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
          <h3 className="rule-label">Public information sheet</h3>{" "}
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

      {customVars.length > 0 && (
        <div className="rounded border border-border p-3">
          <h3 className="rule-label mb-2">Bureau variables for {nation.name}</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">
            These variables were added by the Bureau in the formula workbench and feed directly into
            this state's revenue formulas. Values may be revised here; removing a variable entirely
            is done from the formula workbench's Variables tab.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customVars.map((v) => (
              <label key={v.key} className="block text-sm">
                <span className="rule-label">{v.label}</span>
                <input
                  type="number"
                  step="any"
                  value={String(
                    customVarDraft[v.key] ??
                      (nation.fiscal as Record<string, number> | null)?.[v.key] ??
                      0,
                  )}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCustomVarDraft((d) => ({ ...d, [v.key]: Number.isFinite(val) ? val : 0 }));
                  }}
                  className="tabular mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
            ))}
          </div>
          <button
            onClick={commitCustomVars}
            disabled={busy || Object.keys(customVarDraft).length === 0}
            className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            File variable values
          </button>
        </div>
      )}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/40 p-3">
      <div className="rule-label">{label}</div>
      <div className="tabular mt-1 font-display text-2xl font-bold">{value}</div>
    </div>
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
