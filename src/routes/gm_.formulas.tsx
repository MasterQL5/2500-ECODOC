import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BureauShell } from "@/components/BureauShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { formulaQuery, nationsQuery, taxFormulasQuery } from "@/lib/queries";
import { fmtCompact } from "@/lib/econ";
import {
  OP_SYMBOLS,
  OPERATORS,
  STAT_KEYS,
  STAT_LABELS,
  buildContext,
  customVarsOf,
  describeTokens,
  evalTokens,
  groupOf,
  slugForVariable,
  type CustomVarMeta,
  type FormulaToken,
  type TaxFormula,
} from "@/lib/formula";

export const Route = createFileRoute("/gm_/formulas")({
  head: () => ({
    meta: [
      { title: "Formula Workbench — Bureau of Interstellar Statistics" },
      { name: "description", content: "Compose modular revenue formulas per state." },
      { property: "og:title", content: "Formula Workbench" },
      { property: "og:description", content: "Compose modular revenue formulas per state." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(nationsQuery),
      context.queryClient.ensureQueryData(formulaQuery),
      context.queryClient.ensureQueryData(taxFormulasQuery),
    ]);
  },
  component: FormulaWorkbench,
});

type Draft = {
  key: string;
  id: string | null;
  group: string;
  name: string;
  tokens: FormulaToken[];
  source: string;
  deleted?: boolean;
};

function FormulaWorkbench() {
  const { isGm, loading, user } = useSession();
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const { data: formula } = useSuspenseQuery(formulaQuery);
  const { data: allTaxes } = useSuspenseQuery(taxFormulasQuery);
  const qc = useQueryClient();

  const [nationId, setNationId] = useState<string>("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<{ key: string; index: number } | null>(null);
  const [tab, setTab] = useState<"formulas" | "variables">("formulas");
  const [varDraft, setVarDraft] = useState<Record<string, number>>({});
  const [varDirty, setVarDirty] = useState(false);
  const [customVars, setCustomVars] = useState<CustomVarMeta[]>([]);
  const [newVarLabel, setNewVarLabel] = useState("");

  const nation = nations.find((n) => n.id === nationId) ?? null;

  function selectNation(id: string) {
    if ((dirty || varDirty) && !window.confirm("Discard unsaved amendments?")) return;
    setNationId(id);
    setDrafts(
      allTaxes
        .filter((t) => t.nation_id === id)
        .map((t) => ({
          key: t.id,
          id: t.id,
          group: groupOf(t),
          name: t.name,
          tokens: t.tokens,
          source: t.source,
        })),
    );
    setOpen({});
    setDirty(false);
    setVarDraft({});
    setVarDirty(false);
    const found = nations.find((n) => n.id === id);
    setCustomVars(found ? customVarsOf(found) : []);
    setNewVarLabel("");
  }

  const ctx = useMemo(() => {
    if (!nation) return null;
    const merged = {
      ...nation,
      fiscal: { ...(nation.fiscal as object), ...varDraft, __custom_vars: customVars },
    };
    return buildContext(merged as typeof nation, formula);
  }, [nation, formula, varDraft, customVars]);

  function addCustomVar() {
    const label = newVarLabel.trim();
    if (!label) return;
    const key = slugForVariable(label, [
      ...customVars.map((v) => v.key),
      ...Object.keys((nation?.fiscal ?? {}) as object),
    ]);
    setCustomVars((vs) => [...vs, { key, label }]);
    setVarDraft((d) => ({ ...d, [key]: 0 }));
    setNewVarLabel("");
    setVarDirty(true);
  }

  function removeCustomVar(key: string) {
    setCustomVars((vs) => vs.filter((v) => v.key !== key));
    setVarDraft((d) => {
      const { [key]: _removed, ...rest } = d;
      return rest;
    });
    setVarDirty(true);
  }

  const groups = useMemo(() => {
    const map = new Map<string, Draft[]>();
    for (const d of drafts) {
      if (d.deleted) continue;
      const list = map.get(d.group) ?? [];
      list.push(d);
      map.set(d.group, list);
    }
    return [...map.entries()];
  }, [drafts]);

  if (loading)
    return (
      <BureauShell>
        <p className="text-sm text-muted-foreground">Verifying credentials…</p>
      </BureauShell>
    );

  if (!isGm) {
    return (
      <BureauShell>
        <div className="rounded border border-border bg-card p-6">
          <h1 className="text-2xl font-bold text-primary">Restricted section</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user
              ? "This account has no game-master role."
              : "Sign in with a game-master account to continue."}
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-block rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Go to sign-in
          </Link>
        </div>
      </BureauShell>
    );
  }

  function mutate(key: string, fn: (d: Draft) => Draft) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? fn(d) : d)));
    setDirty(true);
  }

  function renameGroup(from: string, to: string) {
    setDrafts((ds) => ds.map((d) => (d.group === from ? { ...d, group: to } : d)));
    setOpen((o) => ({ ...o, [to]: o[from] ?? true }));
    setDirty(true);
  }

  function addToken(key: string, kind: "num" | "stat" | "fiscal" | "op") {
    const tok: FormulaToken =
      kind === "num"
        ? { t: "num", v: 1 }
        : kind === "stat"
          ? { t: "stat", k: "gdp_nominal" }
          : kind === "fiscal"
            ? { t: "fiscal", k: "income_tax_rate" }
            : { t: "op", v: "*" };
    mutate(key, (d) => ({ ...d, tokens: [...d.tokens, tok] }));
  }

  function updateToken(key: string, i: number, tok: FormulaToken) {
    mutate(key, (d) => ({ ...d, tokens: d.tokens.map((x, j) => (j === i ? tok : x)) }));
  }

  function removeToken(key: string, i: number) {
    mutate(key, (d) => ({ ...d, tokens: d.tokens.filter((_, j) => j !== i) }));
  }

  function moveToken(key: string, from: number, to: number) {
    if (from === to) return;
    mutate(key, (d) => {
      const tokens = [...d.tokens];
      const [x] = tokens.splice(from, 1);
      tokens.splice(to, 0, x!);
      return { ...d, tokens };
    });
  }

  function addBracket(group: string) {
    const count = drafts.filter((d) => !d.deleted && d.group === group).length;
    setDrafts((ds) => [
      ...ds,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        id: null,
        group,
        name: `${group} — bracket ${count + 1}`,
        tokens: [
          { t: "stat", k: "gdp_nominal" },
          { t: "op", v: "*" },
          { t: "num", v: 0.01 },
        ],
        source: "bureau",
      },
    ]);
    setOpen((o) => ({ ...o, [group]: true }));
    setDirty(true);
  }

  function addTax() {
    const name = window.prompt("Name of the new tax / revenue source:");
    if (!name?.trim()) return;
    addBracket(name.trim());
  }

  async function saveAll() {
    if (!nation) return;
    setBusy(true);
    try {
      const kept = drafts.filter((d) => !d.deleted);
      const removed = drafts.filter((d) => d.deleted && d.id);
      if (removed.length > 0) {
        const { error } = await supabase
          .from("tax_formulas")
          .delete()
          .in("id", removed.map((d) => d.id!) as never[]);
        if (error) throw error;
      }
      const savedRows: TaxFormula[] = [];
      for (const [i, d] of kept.entries()) {
        const row = {
          nation_id: nation.id,
          name: d.name,
          group_name: d.group,
          tokens: d.tokens,
          sort_order: (i + 1) * 10,
          source: d.source,
        };
        const { data: savedRow, error } = d.id
          ? await supabase
              .from("tax_formulas")
              .update(row as never)
              .eq("id", d.id)
              .select()
              .single()
          : await supabase
              .from("tax_formulas")
              .insert(row as never)
              .select()
              .single();
        if (error) throw error;
        if (savedRow) savedRows.push(savedRow as unknown as TaxFormula);
      }

      // The formula ledger just changed, so this nation's revenue (and anything derived from
      // it) is recomputed and filed immediately — a filed tax-rate change should show up in the
      // books right away, not silently sit unsimulated until the next year-advance.
      if (ctx) {
        const newRevenue = savedRows.reduce((s, t) => s + evalTokens(t.tokens, ctx), 0);
        const { error: revErr } = await supabase
          .from("nations")
          .update({
            revenue: newRevenue,
            net_income: newRevenue - (nation.expenditures ?? 0),
          } as never)
          .eq("id", nation.id);
        if (revErr) throw revErr;
      }

      await qc.invalidateQueries({ queryKey: ["tax_formulas"] });
      await qc.invalidateQueries({ queryKey: ["nations"] });
      setDirty(false);
      toast.success("Formula ledger saved — revenue on file updated to match");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveVars() {
    if (!nation) return;
    setBusy(true);
    try {
      const removedKeys = customVarsOf(nation)
        .filter((v) => !customVars.some((c) => c.key === v.key))
        .map((v) => v.key);
      const base = { ...((nation.fiscal ?? {}) as Record<string, unknown>) };
      for (const k of removedKeys) delete base[k];
      const merged = {
        ...base,
        ...varDraft,
        __custom_vars: customVars,
      };
      const { error } = await supabase
        .from("nations")
        .update({ fiscal: merged } as never)
        .eq("id", nation.id);
      if (error) throw error;

      // A changed Bureau variable can move the live-computed revenue too — file that
      // immediately rather than leaving it to drift until the next year-advance.
      const nationForRecompute = { ...nation, fiscal: merged };
      const recomputeCtx = buildContext(nationForRecompute, formula);
      const nationTaxes = allTaxes.filter((t) => t.nation_id === nation.id);
      if (nationTaxes.length > 0) {
        const newRevenue = nationTaxes.reduce((s, t) => s + evalTokens(t.tokens, recomputeCtx), 0);
        const { error: revErr } = await supabase
          .from("nations")
          .update({
            revenue: newRevenue,
            net_income: newRevenue - (nation.expenditures ?? 0),
          } as never)
          .eq("id", nation.id);
        if (revErr) throw revErr;
      }

      await qc.invalidateQueries({ queryKey: ["nations"] });
      setVarDirty(false);
      toast.success("Bureau variables saved — revenue on file updated to match");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const children = nation ? nations.filter((n) => n.parent_acronym === nation.acronym) : [];

  /**
   * Copy this state's currently-saved tax formulas and Bureau variables onto every one of its
   * subdivisions, replacing whatever each subdivision had filed for those. Uses the ledger as
   * last saved to the database (not unsaved draft edits), so save first if you want the change
   * you're currently editing included.
   */
  async function applyToSubstates() {
    if (!nation || children.length === 0) return;
    if (dirty || varDirty) {
      toast.error("Save your changes first — substates copy the last saved ledger, not the draft.");
      return;
    }
    if (
      !window.confirm(
        `Replace tax formulas and Bureau variables on all ${children.length} subdivisions of ${nation.name} with ${nation.name}'s own? This overwrites whatever each subdivision currently has filed for these.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const parentTaxes = allTaxes.filter((t) => t.nation_id === nation.id);
      const parentCustomVars = customVarsOf(nation);
      const parentFiscal = (nation.fiscal ?? {}) as Record<string, unknown>;

      for (const child of children) {
        // Replace the child's tax formulas with copies of the parent's.
        const { error: delErr } = await supabase
          .from("tax_formulas")
          .delete()
          .eq("nation_id", child.id);
        if (delErr) throw delErr;
        if (parentTaxes.length > 0) {
          const copies = parentTaxes.map((t) => ({
            nation_id: child.id,
            name: t.name,
            group_name: t.group_name,
            tokens: t.tokens,
            sort_order: t.sort_order,
            source: "bureau",
          }));
          const { error: insErr } = await supabase.from("tax_formulas").insert(copies as never);
          if (insErr) throw insErr;
        }

        // Replace the child's Bureau variables (both the custom-variable definitions and their
        // values) with the parent's, leaving the child's other fiscal fields untouched.
        const childFiscal = { ...((child.fiscal ?? {}) as Record<string, unknown>) };
        for (const v of customVarsOf(child)) delete childFiscal[v.key];
        for (const v of parentCustomVars) {
          childFiscal[v.key] = parentFiscal[v.key] ?? 0;
        }
        childFiscal["__custom_vars"] = parentCustomVars;
        const { error: fiscalErr } = await supabase
          .from("nations")
          .update({ fiscal: childFiscal } as never)
          .eq("id", child.id);
        if (fiscalErr) throw fiscalErr;
      }

      await qc.invalidateQueries({ queryKey: ["tax_formulas"] });
      await qc.invalidateQueries({ queryKey: ["nations"] });
      toast.success(
        `Applied ${nation.name}'s formulas and variables to ${children.length} subdivisions`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply to subdivisions");
    } finally {
      setBusy(false);
    }
  }

  const liveTotal = ctx
    ? drafts.filter((d) => !d.deleted).reduce((s, d) => s + evalTokens(d.tokens, ctx), 0)
    : 0;

  return (
    <BureauShell>
      <Link to="/gm" className="rule-label hover:text-primary">
        ← Game-master panel
      </Link>
      <h1 className="mb-6 mt-2 text-3xl font-bold text-primary">Revenue formula workbench</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="rule-label">State</span>
          <select
            value={nationId}
            onChange={(e) => selectNation(e.target.value)}
            className="mt-1 w-72 rounded border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Select state</option>
            {nations.map((n) => (
              <option key={n.id} value={n.id}>
                {n.acronym} — {n.name}
              </option>
            ))}
          </select>
        </label>
        {nation && (
          <>
            <div className="flex overflow-hidden rounded border border-border">
              {(["formulas", "variables"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                >
                  {t === "formulas" ? "Formulas" : "Variables"}
                </button>
              ))}
            </div>
            {children.length > 0 && (
              <button
                onClick={applyToSubstates}
                disabled={busy}
                className="rounded border border-accent/60 px-3 py-2 text-sm text-accent hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                title={`Copy ${nation.name}'s tax formulas and Bureau variables onto all ${children.length} of its subdivisions`}
              >
                Apply to all {children.length} sub-states
              </button>
            )}
            {tab === "formulas" ? (
              <>
                <button
                  onClick={addTax}
                  className="rounded border border-primary/50 px-3 py-2 text-sm text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  + New tax
                </button>
                <button
                  onClick={saveAll}
                  disabled={!dirty || busy}
                  className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  Save formula ledger
                </button>
              </>
            ) : (
              <button
                onClick={saveVars}
                disabled={!varDirty || busy}
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                Save variables
              </button>
            )}
            <div className="ml-auto text-right">
              <div className="rule-label">Computed total revenue</div>
              <div className="tabular font-display text-2xl font-bold text-primary">
                {fmtCompact(liveTotal, "C$")}
              </div>
            </div>
          </>
        )}
      </div>

      {nation && ctx && tab === "variables" && (
        <div className="rounded border border-border bg-card p-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Bureau variables for {nation.name}. Every formula module referencing a variable
            recomputes immediately; saving files the values against this state.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.keys(ctx.labels).map((k) => {
              const isCustom = customVars.some((v) => v.key === k);
              return (
                <label key={k} className="block text-sm">
                  <span className="rule-label flex items-center gap-1.5">
                    {ctx.labels[k]}
                    {isCustom && (
                      <span className="rounded border border-accent/50 px-1 text-[9px] uppercase tracking-wider text-accent">
                        custom
                      </span>
                    )}
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => removeCustomVar(k)}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        title="Remove this variable"
                      >
                        ×
                      </button>
                    )}
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={String(
                      varDraft[k] ?? (ctx.params as unknown as Record<string, number>)[k] ?? 0,
                    )}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVarDraft((d) => ({ ...d, [k]: Number.isFinite(v) ? v : 0 }));
                      setVarDirty(true);
                    }}
                    className="tabular mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                  />
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <label className="block text-sm">
              <span className="rule-label">New variable name</span>
              <input
                value={newVarLabel}
                onChange={(e) => setNewVarLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomVar();
                  }
                }}
                placeholder="e.g. Asteroid tariff rate"
                className="mt-1 w-64 rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={addCustomVar}
              disabled={!newVarLabel.trim()}
              className="rounded border border-primary/50 px-3 py-1.5 text-sm text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            >
              + New variable
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            New variables are specific to {nation.name} and appear automatically in this state's
            nation panel and in the formula workbench's variable picker once saved.
          </p>
        </div>
      )}

      {!nation && (
        <p className="rounded border border-dashed border-border p-6 text-sm text-muted-foreground">
          Pick a state to compose its revenue formulas. Every tax may be opened to reveal its
          brackets; each bracket is a left-to-right chain of modules — statistics, Bureau variables,
          constants and operators — with its own revenue total. Statistic modules stay live: amend
          the underlying figure and the revenue follows.
        </p>
      )}

      {nation && ctx && tab === "formulas" && (
        <div className="space-y-4">
          {groups.map(([group, rows]) => {
            const groupTotal = rows.reduce((s, d) => s + evalTokens(d.tokens, ctx), 0);
            const isOpen = open[group] ?? false;
            return (
              <section key={group} className="rounded border border-border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [group]: !isOpen }))}
                    className="text-sm text-primary"
                    aria-label="Toggle brackets"
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <input
                    value={group}
                    onChange={(e) => renameGroup(group, e.target.value)}
                    className="w-64 rounded border border-border bg-background px-2 py-1 text-sm font-semibold"
                  />
                  <button
                    onClick={() => addBracket(group)}
                    className="rounded border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary hover:text-primary-foreground"
                    title="Add a bracket to this tax"
                  >
                    +
                  </button>
                  <span className="ml-auto tabular text-sm font-bold text-primary">
                    {fmtCompact(groupTotal, "C$")}
                  </span>
                </div>

                {isOpen && (
                  <div className="space-y-4 p-3">
                    {rows.map((d) => (
                      <div key={d.key} className="rounded border border-border/60 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <input
                            value={d.name}
                            onChange={(e) => mutate(d.key, (t) => ({ ...t, name: e.target.value }))}
                            className="w-64 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                          <div className="flex gap-1">
                            <AddBtn label="+ number" onClick={() => addToken(d.key, "num")} />
                            <AddBtn label="+ statistic" onClick={() => addToken(d.key, "stat")} />
                            <AddBtn label="+ variable" onClick={() => addToken(d.key, "fiscal")} />
                            <AddBtn label="+ operator" onClick={() => addToken(d.key, "op")} />
                          </div>
                          <div className="ml-auto flex items-center gap-3">
                            <span className="tabular text-sm font-bold text-primary">
                              {fmtCompact(evalTokens(d.tokens, ctx), "C$")}
                            </span>
                            <button
                              onClick={() => mutate(d.key, (t) => ({ ...t, deleted: true }))}
                              className="rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            >
                              Strike out
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-stretch gap-1.5">
                          {d.tokens.map((tok, i) => (
                            <div
                              key={i}
                              draggable
                              onDragStart={() => setDrag({ key: d.key, index: i })}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (drag && drag.key === d.key) moveToken(d.key, drag.index, i);
                                setDrag(null);
                              }}
                              className={`flex w-36 cursor-grab flex-col gap-1 rounded border p-1.5 text-xs ${
                                tok.t === "op"
                                  ? "border-accent/50 bg-accent/10"
                                  : tok.t === "stat"
                                    ? "border-primary/50 bg-primary/10"
                                    : tok.t === "fiscal"
                                      ? "border-border bg-secondary"
                                      : "border-border bg-background"
                              }`}
                              title="Drag to reorder"
                            >
                              <div className="flex items-center gap-1">
                                {tok.t === "num" && (
                                  <input
                                    type="number"
                                    step="any"
                                    value={tok.v}
                                    onChange={(e) =>
                                      updateToken(d.key, i, {
                                        ...tok,
                                        t: "num",
                                        v: Number(e.target.value),
                                      })
                                    }
                                    className="w-full rounded border border-border bg-background px-1 py-0.5 text-right text-xs"
                                  />
                                )}
                                {tok.t === "stat" && (
                                  <select
                                    value={tok.k}
                                    onChange={(e) =>
                                      updateToken(d.key, i, {
                                        ...tok,
                                        t: "stat",
                                        k: e.target.value,
                                      })
                                    }
                                    className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                                  >
                                    {STAT_KEYS.map((k) => (
                                      <option key={k} value={k}>
                                        {STAT_LABELS[k]}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {tok.t === "fiscal" && (
                                  <select
                                    value={tok.k}
                                    onChange={(e) =>
                                      updateToken(d.key, i, {
                                        ...tok,
                                        t: "fiscal",
                                        k: e.target.value,
                                      })
                                    }
                                    className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                                  >
                                    {Object.keys(ctx.labels).map((k) => (
                                      <option key={k} value={k}>
                                        {ctx.labels[k]}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {tok.t === "op" && (
                                  <select
                                    value={tok.v}
                                    onChange={(e) =>
                                      updateToken(d.key, i, {
                                        ...tok,
                                        t: "op",
                                        v: e.target.value as never,
                                      })
                                    }
                                    className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                                  >
                                    {OPERATORS.map((op) => (
                                      <option key={op} value={op}>
                                        {OP_SYMBOLS[op]}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  onClick={() => removeToken(d.key, i)}
                                  className="text-muted-foreground hover:text-destructive"
                                  title="Remove module"
                                >
                                  ×
                                </button>
                              </div>
                              <input
                                value={tok.d ?? ""}
                                onChange={(e) =>
                                  updateToken(d.key, i, { ...tok, d: e.target.value })
                                }
                                placeholder="note…"
                                className="w-full rounded border border-border/60 bg-background/60 px-1 py-0.5 text-[10px] text-muted-foreground"
                              />
                            </div>
                          ))}
                          {d.tokens.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              Empty formula — add modules.
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-xs text-muted-foreground">
                          {describeTokens(d.tokens, ctx)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </BureauShell>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
    >
      {label}
    </button>
  );
}
