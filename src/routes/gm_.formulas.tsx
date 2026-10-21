import { useMemo, useState } from "react";
import { withTaxBase } from "@/lib/rollup";
import { canBeCharged, refileLockedLines } from "@/lib/foreignTax";
import {
  EXP_FORMULAS_KEY,
  expFormulasOf,
  expFormulaValue,
  type ExpFormula,
} from "@/lib/expenditureFormulas";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BureauShell } from "@/components/BureauShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import {
  creditTiersQuery,
  formulaPresetsQuery,
  debtInstrumentsQuery,
  formulaQuery,
  nationsQuery,
  taxFormulasQuery,
  type PresetVariable,
} from "@/lib/queries";
import { NumberField } from "@/components/NumberField";
import { FormulaAddButtons, FormulaBlocks, newToken } from "@/components/FormulaEditor";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { fmtCompact, type Nation } from "@/lib/econ";
import {
  currentIssueRate,
  totalInterestDue,
  type CreditTier,
  type DebtInstrument,
} from "@/lib/debt";
import {
  FISCAL_LABELS,
  buildContext,
  customVarsOf,
  labelsFor,
  visibleFieldsOf,
  labelOverridesOf,
  LABEL_OVERRIDES_KEY,
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
      context.queryClient.ensureQueryData(debtInstrumentsQuery),
      context.queryClient.ensureQueryData(creditTiersQuery),
      context.queryClient.ensureQueryData(formulaPresetsQuery),
    ]);
  },
  component: FormulaWorkbench,
});

/** The distinct variable keys a set of formula tokens reads. */
function fiscalKeysOf(tokens: FormulaToken[]): string[] {
  const keys: string[] = [];
  for (const t of tokens) if (t.t === "fiscal" && !keys.includes(t.k)) keys.push(t.k);
  return keys;
}

type Draft = {
  key: string;
  id: string | null;
  group: string;
  name: string;
  tokens: FormulaToken[];
  source: string;
  /** Acronym of the state this tax is charged to (it also files as an expenditure there). */
  charged_to?: string | null;
  /** Switched off: stays on the ledger, greyed out, but yields nothing. */
  disabled?: boolean;
  deleted?: boolean;
};

function FormulaWorkbench() {
  const { isGm, loading, user } = useSession();
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const { data: formula } = useSuspenseQuery(formulaQuery);
  const { data: allTaxes } = useSuspenseQuery(taxFormulasQuery);
  const { data: allDebtInstruments } = useSuspenseQuery(debtInstrumentsQuery);
  const { data: creditTiers } = useSuspenseQuery(creditTiersQuery);
  const { data: presets } = useSuspenseQuery(formulaPresetsQuery);
  const [presetId, setPresetId] = useState("");
  const qc = useQueryClient();
  useNumberDisplay(); // subscribe so toggling short/full numbers re-renders this page's figures

  const [nationId, setNationId] = useState<string>("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"formulas" | "variables" | "debt">("formulas");
  const [varDraft, setVarDraft] = useState<Record<string, number>>({});
  const [varDirty, setVarDirty] = useState(false);
  const [customVars, setCustomVars] = useState<CustomVarMeta[]>([]);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [newVarLabel, setNewVarLabel] = useState("");
  const [expFormulas, setExpFormulas] = useState<ExpFormula[]>([]);
  const [substateTarget, setSubstateTarget] = useState("all");
  const [dragItem, setDragItem] = useState<
    { type: "group"; name: string } | { type: "row"; key: string } | null
  >(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const nation = nations.find((n) => n.id === nationId) ?? null;
  // Has the charged_to column been added to tax_formulas yet?
  const chargedColumn = allTaxes.length > 0 && "charged_to" in (allTaxes[0] as object);

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
          charged_to: t.charged_to ?? null,
          disabled: t.disabled === true,
        })),
    );
    setOpen({});
    setDirty(false);
    setVarDraft({});
    setVarDirty(false);
    const found = nations.find((n) => n.id === id);
    setCustomVars(found ? customVarsOf(found) : []);
    setVisibleFields(found ? visibleFieldsOf(found) : new Set());
    setLabelOverrides(found ? labelOverridesOf(found) : {});
    setExpFormulas(found ? expFormulasOf(found) : []);
    setSubstateTarget("all");
    setNewVarLabel("");
  }

  const ctx = useMemo(() => {
    if (!nation) return null;
    const merged = {
      ...nation,
      fiscal: {
        ...(nation.fiscal as object),
        ...varDraft,
        __custom_vars: customVars,
        [LABEL_OVERRIDES_KEY]: labelOverrides,
      },
    };
    return buildContext(withTaxBase(merged as typeof nation, nations), formula, nations);
  }, [nation, nations, formula, varDraft, customVars, labelOverrides]);

  /** Rename a variable for this state. Custom variables carry their own label; a built-in Bureau
   * variable gets an override, and clearing the box restores its standard name. */
  function renameVariable(key: string, label: string) {
    if (customVars.some((v) => v.key === key)) {
      setCustomVars((vs) => vs.map((v) => (v.key === key ? { ...v, label } : v)));
    } else {
      setLabelOverrides((o) => {
        const { [key]: _old, ...rest } = o;
        return label === "" ? rest : { ...rest, [key]: label };
      });
    }
    setVarDirty(true);
  }

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

  function toggleFieldVisibility(key: string) {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
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

  function updateExp(id: string, fn: (f: ExpFormula) => ExpFormula) {
    setExpFormulas((list) => list.map((f) => (f.id === id ? fn(f) : f)));
    setVarDirty(true);
    setDirty(true);
  }

  function addExpFormula() {
    const name = window.prompt("Name of the locked expenditure:");
    if (!name?.trim()) return;
    setExpFormulas((list) => [
      ...list,
      {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        tokens: [
          { t: "stat", k: "gdp_nominal" },
          { t: "op", v: "*" },
          { t: "num", v: 0.01 },
        ],
        paid_to: null,
      },
    ]);
    setVarDirty(true);
    setDirty(true);
  }

  // ---- Drag taxes (and their brackets) around the ledger -------------------------------------

  /** Move a whole tax (all its brackets) so it sits before another tax, or last. */
  function moveGroup(name: string, before: string | null) {
    if (name === before) return;
    setDrafts((ds) => {
      const moving = ds.filter((d) => d.group === name);
      const rest = ds.filter((d) => d.group !== name);
      const at = before === null ? -1 : rest.findIndex((d) => d.group === before);
      return at < 0 ? [...rest, ...moving] : [...rest.slice(0, at), ...moving, ...rest.slice(at)];
    });
    setDirty(true);
  }

  /** Move one bracket into a tax: before another bracket of it, or at its end. A bracket taken
   * into a different tax joins that tax's "charged to" and on/off state. */
  function moveRow(key: string, group: string, before: string | null) {
    if (key === before) return;
    setDrafts((ds) => {
      const row = ds.find((d) => d.key === key);
      if (!row) return ds;
      const peers = ds.filter((d) => d.key !== key && d.group === group && !d.deleted);
      const moved: Draft =
        row.group === group
          ? row
          : {
              ...row,
              group,
              charged_to: peers[0]?.charged_to ?? null,
              disabled: peers.length > 0 ? peers.every((d) => d.disabled) : row.disabled === true,
            };
      const rest = ds.filter((d) => d.key !== key);
      let at: number;
      if (before !== null) at = rest.findIndex((d) => d.key === before);
      else {
        const last = rest.map((d) => d.group).lastIndexOf(group);
        at = last < 0 ? rest.length : last + 1;
      }
      if (at < 0) at = rest.length;
      return [...rest.slice(0, at), moved, ...rest.slice(at)];
    });
    setOpen((o) => ({ ...o, [group]: true }));
    setDirty(true);
  }

  function addBracket(group: string) {
    const count = drafts.filter((d) => !d.deleted && d.group === group).length;
    const chargedTo = drafts.find((d) => !d.deleted && d.group === group)?.charged_to ?? null;
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
        charged_to: chargedTo,
      },
    ]);
    setOpen((o) => ({ ...o, [group]: true }));
    setDirty(true);
  }

  /** Save one tax (all its brackets) as a preset. The preset also takes the state's own custom
   * variables the brackets read — name, and current value as the default — so importing it
   * into a state that lacks them recreates them. */
  async function savePreset(group: string, rows: Draft[]) {
    if (!ctx) return;
    const name = window.prompt("Preset name:", group);
    if (!name?.trim()) return;
    const existing = presets.find((p) => p.name === name.trim());
    if (existing && !window.confirm(`Replace the existing preset "${existing.name}"?`)) return;
    const brackets = rows.map((r) => ({ name: r.name, tokens: r.tokens }));
    const params = ctx.params as unknown as Record<string, number>;
    const variables: PresetVariable[] = fiscalKeysOf(rows.flatMap((r) => r.tokens))
      .filter((k) => !(k in FISCAL_LABELS))
      .map((k) => ({
        key: k,
        label: ctx.labels[k] ?? k.replace(/_/g, " "),
        value: Number(varDraft[k] ?? params[k] ?? 0) || 0,
      }));
    const row = { name: name.trim(), brackets, variables };
    const { error } = existing
      ? await supabase
          .from("formula_presets" as never)
          .update({ brackets, variables } as never)
          .eq("id", existing.id)
      : await supabase.from("formula_presets" as never).insert(row as never);
    if (error) {
      const missingTable = /does not exist|schema cache|could not find/i.test(error.message);
      const missingColumn = /variables/i.test(error.message);
      toast.error(
        missingTable || missingColumn
          ? `Could not save preset: ${error.message}. Run formula_presets.sql in the Supabase SQL editor first.`
          : `Could not save preset: ${error.message}`,
      );
      return;
    }
    await qc.invalidateQueries({ queryKey: ["formula_presets"] });
    toast.success(
      variables.length
        ? `Preset "${name.trim()}" saved with ${variables.length} variable${variables.length === 1 ? "" : "s"}`
        : `Preset "${name.trim()}" saved`,
    );
  }

  /** Import the chosen preset into the selected state. Variables the state lacks are created
   * (from the preset's own definitions, or — for older presets — from the tokens themselves, at
   * 0); variables it already has are left exactly as they are. */
  function applyPreset() {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset || !nation) return;
    // Pick a tax name that doesn't collide with one this state already has.
    const taken = new Set(drafts.filter((d) => !d.deleted).map((d) => d.group));
    let group = preset.name;
    for (let i = 2; taken.has(group); i++) group = `${preset.name} ${i}`;
    const stamp = Date.now();
    setDrafts((ds) => [
      ...ds,
      ...preset.brackets.map((b, i) => ({
        key: `new-${stamp}-${i}-${Math.random().toString(36).slice(2)}`,
        id: null,
        group,
        name: b.name,
        tokens: JSON.parse(JSON.stringify(b.tokens)) as FormulaToken[],
        source: "bureau",
      })),
    ]);
    setOpen((o) => ({ ...o, [group]: true }));
    setDirty(true);

    const have = new Set(Object.keys(ctx?.labels ?? {}));
    const created = new Map<string, PresetVariable>();
    for (const v of preset.variables ?? []) {
      if (!have.has(v.key)) created.set(v.key, v);
    }
    for (const k of fiscalKeysOf(preset.brackets.flatMap((b) => b.tokens))) {
      if (!have.has(k) && !created.has(k)) {
        created.set(k, { key: k, label: k.replace(/_/g, " "), value: 0 });
      }
    }
    if (created.size > 0) {
      const added = [...created.values()];
      setCustomVars((vs) => [...vs, ...added.map((v) => ({ key: v.key, label: v.label }))]);
      setVarDraft((d) => ({
        ...d,
        ...Object.fromEntries(added.map((v) => [v.key, Number(v.value) || 0])),
      }));
      setVarDirty(true);
    }
    toast.success(
      created.size > 0
        ? `Added "${group}" and created ${created.size} variable${created.size === 1 ? "" : "s"} (${[...created.keys()].join(", ")}). Save the formula ledger to keep both.`
        : `Added "${group}". Save the formula ledger to keep it.`,
    );
  }

  async function deletePreset() {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset || !window.confirm(`Delete the preset "${preset.name}"?`)) return;
    const { data: gone, error } = await supabase
      .from("formula_presets" as never)
      .delete()
      .eq("id", preset.id)
      .select("id");
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!gone || gone.length === 0) {
      toast.error(
        "The database refused to delete it — your account needs the GM role and the formula_presets.sql grants (run formula_presets.sql in the Supabase SQL editor).",
      );
      return;
    }
    setPresetId("");
    await qc.invalidateQueries({ queryKey: ["formula_presets"] });
    toast.success("Preset deleted");
  }

  function addTax() {
    const name = window.prompt("Name of the new tax / revenue source:");
    if (!name?.trim()) return;
    addBracket(name.trim());
  }

  /** After a change, refile everything the system files by itself — this state's revenue, the
   * locked lines its taxes and expenditure formulas put on other states, and what it pays them. */
  async function refileAround(
    pendingFiscal: Record<string, unknown> | null,
    taxesNow: TaxFormula[],
    extra: Iterable<string>,
    forceRevenue: boolean,
  ) {
    if (!nation) return;
    const nextExp = pendingFiscal
      ? ((pendingFiscal[EXP_FORMULAS_KEY] as ExpFormula[] | undefined) ?? [])
      : expFormulasOf(nation);
    const affected = new Set<string>([nation.acronym, ...extra]);
    for (const f of [...expFormulasOf(nation), ...nextExp]) if (f.paid_to) affected.add(f.paid_to);
    const world = nations.map((n) =>
      n.id === nation.id
        ? ({ ...n, ...(pendingFiscal ? { fiscal: pendingFiscal } : {}) } as Nation)
        : n,
    );
    for (const f of refileLockedLines(
      world,
      taxesNow,
      formula,
      affected,
      forceRevenue ? [nation.acronym] : [],
    )) {
      const { error } = await supabase
        .from("nations")
        .update(f.patch as never)
        .eq("id", f.id);
      if (error) throw error;
    }
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
          // Sent only once the column exists (or is being used), so saving works before the SQL.
          ...(chargedColumn || d.charged_to ? { charged_to: d.charged_to ?? null } : {}),
          ...(chargedColumn || d.disabled ? { disabled: d.disabled === true } : {}),
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
      // books right away, not silently sit unsimulated until the next year-advance. Any pending
      // variable changes (e.g. variables an imported preset just created) are filed in the same
      // update, so the ledger never ends up reading variables that were not saved.
      const pendingFiscal = varDirty ? mergedFiscal() : null;
      // Taxes charged to another state also file as locked lines there. Refile every state this
      // ledger charged before or charges now, so removing or retargeting a tax clears the old line.
      const payers = new Set<string>();
      for (const t of allTaxes)
        if (t.nation_id === nation.id && t.charged_to) payers.add(t.charged_to);
      for (const t of savedRows) if (t.charged_to) payers.add(t.charged_to);
      if (pendingFiscal) {
        const { error: fErr } = await supabase
          .from("nations")
          .update({ fiscal: pendingFiscal } as never)
          .eq("id", nation.id);
        if (fErr) throw fErr;
      }
      await refileAround(
        pendingFiscal,
        [...allTaxes.filter((t) => t.nation_id !== nation.id), ...savedRows],
        payers,
        true,
      );

      await qc.invalidateQueries({ queryKey: ["tax_formulas"] });
      await qc.invalidateQueries({ queryKey: ["nations"] });
      setDirty(false);
      if (pendingFiscal) setVarDirty(false);
      toast.success(
        pendingFiscal
          ? "Formula ledger and variables saved — revenue on file updated to match"
          : "Formula ledger saved — revenue on file updated to match",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
      toast.error(
        msg && /charged_to/.test(msg)
          ? "Charging a tax to another state needs the charged_to column — run ecodoc_tax_charged_to.sql in the Supabase SQL editor first."
          : (msg ?? "Save failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  /** The state's fiscal object with every pending variable change applied (values, new and
   * removed custom variables, visibility, renames). */
  function mergedFiscal(): Record<string, unknown> {
    const removedKeys = customVarsOf(nation!)
      .filter((v) => !customVars.some((c) => c.key === v.key))
      .map((v) => v.key);
    const base = { ...((nation!.fiscal ?? {}) as Record<string, unknown>) };
    for (const k of removedKeys) delete base[k];
    return {
      ...base,
      ...varDraft,
      __custom_vars: customVars,
      __visible_fields: Array.from(visibleFields),
      [LABEL_OVERRIDES_KEY]: labelOverrides,
      [EXP_FORMULAS_KEY]: expFormulas,
    };
  }

  async function saveVars() {
    if (!nation) return;
    setBusy(true);
    try {
      const merged = mergedFiscal();
      const { error } = await supabase
        .from("nations")
        .update({ fiscal: merged } as never)
        .eq("id", nation.id);
      if (error) throw error;

      // A changed Bureau variable can move the live-computed revenue and the spending formulas
      // too — file that immediately rather than leaving it to drift until the next year-advance.
      await refileAround(
        merged,
        allTaxes,
        [],
        allTaxes.some((t) => t.nation_id === nation.id),
      );

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
  const substateTargets =
    substateTarget === "all" ? children : children.filter((c) => c.id === substateTarget);

  /**
   * Copy this state's currently-saved tax formulas and Bureau variables onto every one of its
   * subdivisions, replacing whatever each subdivision had filed for those. Uses the ledger as
   * last saved to the database (not unsaved draft edits), so save first if you want the change
   * you're currently editing included.
   */
  async function applyToSubstates() {
    if (!nation || substateTargets.length === 0) return;
    if (dirty || varDirty) {
      toast.error("Save your changes first — substates copy the last saved ledger, not the draft.");
      return;
    }
    if (
      !window.confirm(
        `Replace tax formulas and Bureau variables on ${substateTargets.length === children.length ? `all ${children.length} subdivisions` : substateTargets.map((c) => c.name).join(", ")} of ${nation.name} with ${nation.name}'s own? This overwrites whatever each subdivision currently has filed for these.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const parentTaxes = allTaxes.filter((t) => t.nation_id === nation.id);
      const parentFiscal = (nation.fiscal ?? {}) as Record<string, unknown>;
      // Every variable the copied formulas read has to exist on each subdivision, exactly as an
      // imported preset creates its own: the parent's custom variables, plus any key a formula
      // reads that is neither a standard Bureau variable nor defined as custom (e.g. left behind
      // by an earlier import), which is created under its parent's name at the parent's value.
      const parentLabels = labelsFor(nation);
      const parentCustomVars = customVarsOf(nation);
      const readKeys = fiscalKeysOf(parentTaxes.flatMap((t) => t.tokens));
      const undeclared = readKeys
        .filter((k) => !(k in FISCAL_LABELS) && !parentCustomVars.some((v) => v.key === k))
        .map((k) => ({ key: k, label: parentLabels[k] ?? k.replace(/_/g, " ") }));
      const varsToCopy = [...parentCustomVars, ...undeclared];
      // Names the parent gave to standard variables its formulas read follow along too.
      const parentRenames = Object.fromEntries(
        Object.entries(labelOverridesOf(nation)).filter(([k]) => readKeys.includes(k)),
      );

      for (const child of substateTargets) {
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
            ...(t.disabled ? { disabled: true } : {}),
          }));
          const { error: insErr } = await supabase.from("tax_formulas").insert(copies as never);
          if (insErr) throw insErr;
        }

        // Replace the child's Bureau variables (both the custom-variable definitions and their
        // values) with the parent's, leaving the child's other fiscal fields untouched.
        const childFiscal = { ...((child.fiscal ?? {}) as Record<string, unknown>) };
        for (const v of customVarsOf(child)) delete childFiscal[v.key];
        for (const v of varsToCopy) {
          childFiscal[v.key] = parentFiscal[v.key] ?? 0;
        }
        childFiscal["__custom_vars"] = varsToCopy;
        if (Object.keys(parentRenames).length > 0) {
          childFiscal[LABEL_OVERRIDES_KEY] = {
            ...labelOverridesOf({ fiscal: childFiscal } as typeof child),
            ...parentRenames,
          };
        }
        const { error: fiscalErr } = await supabase
          .from("nations")
          .update({ fiscal: childFiscal } as never)
          .eq("id", child.id);
        if (fiscalErr) throw fiscalErr;
      }

      await qc.invalidateQueries({ queryKey: ["tax_formulas"] });
      await qc.invalidateQueries({ queryKey: ["nations"] });
      toast.success(
        `Applied ${nation.name}'s formulas and variables to ${substateTargets.length === 1 ? substateTargets[0]!.name : `${substateTargets.length} subdivisions`}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply to subdivisions");
    } finally {
      setBusy(false);
    }
  }

  const liveTotal = ctx
    ? drafts
        .filter((d) => !d.deleted && !d.disabled)
        .reduce((s, d) => s + evalTokens(d.tokens, ctx), 0)
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
              {(["formulas", "variables", "debt"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
                >
                  {t === "formulas"
                    ? "Formulas"
                    : t === "variables"
                      ? "Variables"
                      : "Debt & Credit"}
                </button>
              ))}
            </div>
            {children.length > 0 && (
              <div className="flex items-center gap-1">
                <select
                  value={substateTarget}
                  onChange={(e) => setSubstateTarget(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-2 text-sm"
                  title="Which subdivisions receive this state's formulas and variables"
                  aria-label="Subdivisions to apply to"
                >
                  <option value="all">All {children.length} sub-states</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={applyToSubstates}
                  disabled={busy}
                  className="rounded border border-accent/60 px-3 py-2 text-sm text-accent hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  title={`Copy ${nation.name}'s tax formulas and Bureau variables onto the chosen subdivisions`}
                >
                  {substateTarget === "all" ? "Apply to all" : "Apply to this one"}
                </button>
              </div>
            )}
            {tab === "formulas" ? (
              <>
                <select
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-2 text-sm"
                  title="Saved tax presets"
                >
                  <option value="">Preset…</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={applyPreset}
                  disabled={!presetId}
                  className="rounded border border-accent/60 px-3 py-2 text-sm text-accent hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  title="Import this preset into the selected state, creating any variables it needs that the state lacks"
                >
                  Apply preset
                </button>
                <button
                  onClick={deletePreset}
                  disabled={!presetId}
                  className="rounded border border-destructive/50 px-3 py-2 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                  title={presetId ? "Delete the selected preset" : "Pick a preset first"}
                >
                  Delete preset
                </button>
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
                <div key={k} className="block text-sm">
                  <span className="rule-label flex items-center gap-1.5">
                    <input
                      value={ctx.labels[k] ?? k}
                      onChange={(e) => renameVariable(k, e.target.value)}
                      title="Rename this variable (this state only)"
                      aria-label={`Name of variable ${k}`}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs uppercase tracking-wider hover:border-border focus:border-primary focus:bg-background focus:outline-none"
                    />
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
                  <label className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={visibleFields.has(k)}
                      onChange={() => toggleFieldVisibility(k)}
                    />
                    Player can see and change this in their nation tab
                  </label>
                  <NumberField
                    value={varDraft[k] ?? (ctx.params as unknown as Record<string, number>)[k] ?? 0}
                    onCommit={(v) => {
                      setVarDraft((d) => ({ ...d, [k]: v }));
                      setVarDirty(true);
                    }}
                    className="tabular mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                  />
                </div>
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

      {nation && tab === "debt" && (
        <DebtCreditTab
          nation={nation}
          instruments={allDebtInstruments.filter((d) => d.nation_id === nation.id)}
          creditTiers={creditTiers}
          qc={qc}
        />
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
            const groupTotal = rows.reduce(
              (s, d) => s + (d.disabled ? 0 : evalTokens(d.tokens, ctx)),
              0,
            );
            const groupOff = rows.every((d) => d.disabled);
            const isOpen = open[group] ?? false;
            return (
              <section
                key={group}
                onDragOver={(e) => {
                  if (!dragItem) return;
                  e.preventDefault();
                  setDropOn(`g:${group}`);
                }}
                onDragLeave={() => setDropOn((o) => (o === `g:${group}` ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragItem?.type === "group") moveGroup(dragItem.name, group);
                  else if (dragItem?.type === "row") moveRow(dragItem.key, group, null);
                  setDragItem(null);
                  setDropOn(null);
                }}
                className={`rounded border bg-card ${dropOn === `g:${group}` ? "border-primary" : "border-border"} ${groupOff ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [group]: !isOpen }))}
                    className="text-sm text-primary"
                    aria-label="Toggle brackets"
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <span
                    draggable
                    onDragStart={() => setDragItem({ type: "group", name: group })}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDropOn(null);
                    }}
                    className="cursor-grab select-none text-muted-foreground"
                    title="Drag to reorder this tax, or onto another tax to place it before it"
                    aria-label="Drag tax"
                  >
                    ⠿
                  </span>
                  <GroupNameInput group={group} onRename={renameGroup} />
                  <button
                    onClick={() => addBracket(group)}
                    className="rounded border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary hover:text-primary-foreground"
                    title="Add a bracket to this tax"
                  >
                    +
                  </button>
                  <button
                    onClick={() => {
                      setDrafts((ds) =>
                        ds.map((d) => (d.group === group ? { ...d, disabled: !groupOff } : d)),
                      );
                      setDirty(true);
                    }}
                    className={`rounded border px-2 py-1 text-xs ${groupOff ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
                    title={
                      groupOff
                        ? "Switch this tax back on"
                        : "Switch this tax off: it stays on the ledger, greyed out, but yields nothing"
                    }
                  >
                    {groupOff ? "Enable" : "Disable"}
                  </button>
                  <label
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                    title="Also file this tax as a locked expenditure on the chosen state, so its net income, treasury and debt fall by what this state collects. Calculated on that state's figures before the tax."
                  >
                    Charged to
                    <select
                      value={rows[0]?.charged_to ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setDrafts((ds) =>
                          ds.map((d) => (d.group === group ? { ...d, charged_to: v } : d)),
                        );
                        setDirty(true);
                      }}
                      className="rounded border border-border bg-background px-1 py-1 text-xs"
                    >
                      <option value="">— nobody (domestic) —</option>
                      {nations
                        .filter((n) => n.id !== nation.id)
                        .map((n) => (
                          <option key={n.id} value={n.acronym} disabled={!canBeCharged(n, nations)}>
                            {n.name}
                            {canBeCharged(n, nations) ? "" : " (finances are a sum of members)"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    onClick={() => savePreset(group, rows)}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                    title="Save this tax, its brackets and the custom variables they read as a reusable preset"
                  >
                    Save as preset
                  </button>
                  <span className="ml-auto tabular text-sm font-bold text-primary">
                    {groupOff ? "disabled" : fmtCompact(groupTotal, "C$")}
                  </span>
                </div>

                {isOpen && (
                  <div className="space-y-4 p-3">
                    {rows.map((d) => (
                      <div
                        key={d.key}
                        onDragOver={(e) => {
                          if (dragItem?.type !== "row") return;
                          e.preventDefault();
                          e.stopPropagation();
                          setDropOn(`r:${d.key}`);
                        }}
                        onDrop={(e) => {
                          if (dragItem?.type !== "row") return;
                          e.preventDefault();
                          e.stopPropagation();
                          moveRow(dragItem.key, group, d.key);
                          setDragItem(null);
                          setDropOn(null);
                        }}
                        className={`rounded border p-3 ${dropOn === `r:${d.key}` ? "border-primary" : "border-border/60"} ${d.disabled ? "opacity-50" : ""}`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            draggable
                            onDragStart={() => setDragItem({ type: "row", key: d.key })}
                            onDragEnd={() => {
                              setDragItem(null);
                              setDropOn(null);
                            }}
                            className="cursor-grab select-none text-muted-foreground"
                            title="Drag this bracket up or down, or into another tax"
                            aria-label="Drag bracket"
                          >
                            ⠿
                          </span>
                          <input
                            value={d.name}
                            onChange={(e) => mutate(d.key, (t) => ({ ...t, name: e.target.value }))}
                            className="w-64 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                          <FormulaAddButtons
                            add={(kind) =>
                              mutate(d.key, (t) => ({
                                ...t,
                                tokens: [...t.tokens, newToken(kind, nations, nation?.acronym)],
                              }))
                            }
                          />
                          <div className="ml-auto flex items-center gap-3">
                            <span className="tabular text-sm font-bold text-primary">
                              {d.disabled
                                ? "disabled"
                                : fmtCompact(evalTokens(d.tokens, ctx), "C$")}
                            </span>
                            <button
                              onClick={() =>
                                mutate(d.key, (t) => ({ ...t, disabled: !t.disabled }))
                              }
                              className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                              title="Switch this bracket off or on without losing it"
                            >
                              {d.disabled ? "Enable" : "Disable"}
                            </button>
                            <button
                              onClick={() => mutate(d.key, (t) => ({ ...t, deleted: true }))}
                              className="rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            >
                              Strike out
                            </button>
                          </div>
                        </div>

                        <FormulaBlocks
                          tokens={d.tokens}
                          onChange={(tokens) => mutate(d.key, (t) => ({ ...t, tokens }))}
                          ctx={ctx}
                          nations={nations}
                        />

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

          <section className="rounded border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
              <h2 className="text-sm font-semibold">Locked expenditures</h2>
              <button
                onClick={addExpFormula}
                className="rounded border border-primary/50 px-2 py-1 text-xs text-primary hover:bg-primary hover:text-primary-foreground"
                title="Add spending that is set by formula and locked on the state's books"
              >
                + New expenditure
              </button>
              <span className="ml-auto tabular text-sm font-bold text-primary">
                {fmtCompact(
                  expFormulas.reduce((s, f) => s + expFormulaValue(f, ctx), 0),
                  "C$",
                )}
              </span>
            </div>
            <p className="px-3 pt-2 text-[11px] text-muted-foreground">
              Spending set by formula. Each year advance files it as a locked line on {nation.name}
              &apos;s books that nobody can edit; a line paid to another state also reaches that
              state as revenue. Avoid reading this state&apos;s own net income or expenditures here
              — they already contain these lines.
            </p>
            <div className="space-y-4 p-3">
              {expFormulas.length === 0 && (
                <p className="text-xs text-muted-foreground">No locked expenditures yet.</p>
              )}
              {expFormulas.map((f) => (
                <div
                  key={f.id}
                  className={`rounded border border-border/60 p-3 ${f.disabled ? "opacity-50" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <input
                      value={f.name}
                      onChange={(e) => updateExp(f.id, (x) => ({ ...x, name: e.target.value }))}
                      className="w-64 rounded border border-border bg-background px-2 py-1 text-xs"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Paid to
                      <select
                        value={f.paid_to ?? ""}
                        onChange={(e) =>
                          updateExp(f.id, (x) => ({ ...x, paid_to: e.target.value || null }))
                        }
                        className="rounded border border-border bg-background px-1 py-1 text-xs"
                      >
                        <option value="">— nobody (spent at home) —</option>
                        {nations
                          .filter((n) => n.id !== nation.id)
                          .map((n) => (
                            <option
                              key={n.id}
                              value={n.acronym}
                              disabled={!canBeCharged(n, nations)}
                            >
                              {n.name}
                              {canBeCharged(n, nations) ? "" : " (finances are a sum of members)"}
                            </option>
                          ))}
                      </select>
                    </label>
                    <FormulaAddButtons
                      add={(kind) =>
                        updateExp(f.id, (x) => ({
                          ...x,
                          tokens: [...x.tokens, newToken(kind, nations, nation.acronym)],
                        }))
                      }
                    />
                    <div className="ml-auto flex items-center gap-3">
                      <span className="tabular text-sm font-bold text-primary">
                        {f.disabled ? "disabled" : fmtCompact(evalTokens(f.tokens, ctx), "C$")}
                      </span>
                      <button
                        onClick={() => updateExp(f.id, (x) => ({ ...x, disabled: !x.disabled }))}
                        className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                      >
                        {f.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        onClick={() => {
                          setExpFormulas((list) => list.filter((x) => x.id !== f.id));
                          setVarDirty(true);
                          setDirty(true);
                        }}
                        className="rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      >
                        Strike out
                      </button>
                    </div>
                  </div>
                  <FormulaBlocks
                    tokens={f.tokens}
                    onChange={(tokens) => updateExp(f.id, (x) => ({ ...x, tokens }))}
                    ctx={ctx}
                    nations={nations}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {describeTokens(f.tokens, ctx)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </BureauShell>
  );
}

/** The bracket/category name (e.g. "Income Tax") edited with its own local draft state, so
 * typing doesn't rename the group — and therefore change its identity as a React key — on
 * every keystroke. The rename only commits on blur or Enter, which is what actually fixed the
 * "have to click back in after every character" bug: the group's real name (and the key the
 * outer list re-renders on) no longer changes mid-keystroke. */
/**
 * A nation's debt broken into its individual tranches — the general pool (auto-compounding,
 * auto-adjusted by year-advance surplus/deficit) plus any specific instruments a GM has carved
 * out to represent a real contract (an international loan, a bond issue) with its own locked
 * rate. Also hosts the global credit-tier editor, since tier changes affect what rate *new*
 * debt gets — this nation's own tier selector lives right alongside it.
 */
function DebtCreditTab({
  nation,
  instruments,
  creditTiers,
  qc,
}: {
  nation: Nation;
  instruments: DebtInstrument[];
  creditTiers: CreditTier[];
  qc: QueryClient;
}) {
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrincipal, setNewPrincipal] = useState(0);
  const [newRateOverride, setNewRateOverride] = useState<number | null>(null);
  const [draggedInstrument, setDraggedInstrument] = useState<string | null>(null);

  const currentTier = creditTiers.find((t) => t.id === nation.credit_tier_id) ?? null;
  const issueRate = currentIssueRate(nation, currentTier);
  const totalDebt = instruments.reduce((s, d) => s + d.principal, 0);
  const totalInterest = totalInterestDue(instruments);

  /**
   * Recompute this nation's total interest due right now from its current debt instruments and
   * file it as the locked "Interest payments" expenditure line immediately — the same "don't
   * wait for year-advance to see the effect" treatment already given to formula and Bureau
   * variable changes. Only called after something that changes principal (issuing, resizing, or
   * clearing a tranche); changing the base rate or credit tier only affects *new* debt, so it
   * never moves this year's already-locked-in interest bill.
   */
  async function syncInterestExpenditure(nextInstruments: DebtInstrument[]) {
    const interestDue = totalInterestDue(nextInstruments);
    const otherItems = (nation.expenditure_items ?? []).filter(
      (i) => i.label !== "Interest payments",
    );
    // With no itemised spending, everything on file apart from the old interest line is the
    // "other" spending; counting it as zero would wipe it out.
    const previousInterest =
      (nation.expenditure_items ?? []).find((i) => i.label === "Interest payments")?.amount ?? 0;
    const otherTotal =
      otherItems.length > 0
        ? otherItems.reduce(
            (s, i) => s + (i.amount ?? (i.share ?? 0) * (nation.expenditures ?? 0)),
            0,
          )
        : Math.max(0, (nation.expenditures ?? 0) - previousInterest);
    const newExpenditures = otherTotal + interestDue;
    const newNetIncome = nation.revenue !== null ? nation.revenue - newExpenditures : null;
    const { error } = await supabase
      .from("nations")
      .update({
        expenditures: newExpenditures,
        expenditure_items: [...otherItems, { label: "Interest payments", amount: interestDue }],
        ...(newNetIncome !== null ? { net_income: newNetIncome } : {}),
      } as never)
      .eq("id", nation.id);
    if (error) {
      toast.error(`Debt saved, but could not update the interest line: ${error.message}`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["nations"] });
  }

  async function setTier(tierId: string) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("nations")
        .update({ credit_tier_id: tierId } as never)
        .eq("id", nation.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["nations"] });
      toast.success("Credit tier updated — only new debt issued from here uses the new rate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update credit tier");
    } finally {
      setBusy(false);
    }
  }

  async function issueDebt() {
    const label = newLabel.trim();
    if (!label) {
      toast.error("Name this debt instrument");
      return;
    }
    if (!Number.isFinite(newPrincipal) || newPrincipal <= 0) {
      toast.error("Principal must be a positive amount");
      return;
    }
    setBusy(true);
    try {
      const worstSort =
        instruments.length > 0 ? Math.max(...instruments.map((d) => d.sort_order)) : 0;
      const { data: inserted, error } = await supabase
        .from("debt_instruments" as never)
        .insert({
          nation_id: nation.id,
          label,
          principal: newPrincipal,
          interest_rate: newRateOverride ?? issueRate,
          is_general: false,
          credit_tier_name_at_issue: currentTier?.name ?? null,
          sort_order: worstSort + 10,
        } as never)
        .select()
        .single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["debt_instruments"] });
      await syncInterestExpenditure([...instruments, inserted as unknown as DebtInstrument]);
      toast.success(
        `${label} filed at ${((newRateOverride ?? issueRate) * 100).toFixed(2)}% — this rate is locked in, interest on file updated`,
      );
      setNewLabel("");
      setNewPrincipal(0);
      setNewRateOverride(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not file this debt instrument");
    } finally {
      setBusy(false);
    }
  }

  async function reorderInstrument(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const ordered = [...instruments];
    const fromIndex = ordered.findIndex((d) => d.id === draggedId);
    const toIndex = ordered.findIndex((d) => d.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = ordered.splice(fromIndex, 1);
    if (!moved) return;
    ordered.splice(toIndex, 0, moved);
    setBusy(true);
    try {
      for (const [i, d] of ordered.entries()) {
        const newSort = (i + 1) * 10;
        if (d.sort_order === newSort) continue;
        const { error } = await supabase
          .from("debt_instruments" as never)
          .update({ sort_order: newSort } as never)
          .eq("id", d.id);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["debt_instruments"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reorder debt");
    } finally {
      setBusy(false);
    }
  }

  async function updatePrincipal(id: string, principal: number) {
    setBusy(true);
    try {
      const clamped = Math.max(0, principal);
      const { error } = await supabase
        .from("debt_instruments" as never)
        .update({ principal: clamped } as never)
        .eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["debt_instruments"] });
      await syncInterestExpenditure(
        instruments.map((d) => (d.id === id ? { ...d, principal: clamped } : d)),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not amend this tranche");
    } finally {
      setBusy(false);
    }
  }

  async function setDefaulted(id: string, defaulted: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("debt_instruments" as never)
        .update({ defaulted } as never)
        .eq("id", id);
      if (error) {
        throw new Error(`${error.message} — has the debt_defaulted SQL been run in Supabase?`);
      }
      await qc.invalidateQueries({ queryKey: ["debt_instruments"] });
      await syncInterestExpenditure(
        instruments.map((d) => (d.id === id ? { ...d, defaulted } : d)),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change default status");
    } finally {
      setBusy(false);
    }
  }

  async function removeInstrument(id: string, label: string) {
    if (!window.confirm(`Remove "${label}" entirely? This forgives the remaining principal.`))
      return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("debt_instruments" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["debt_instruments"] });
      await syncInterestExpenditure(instruments.filter((d) => d.id !== id));
      toast.success(`${label} cleared — interest on file updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this tranche");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-card p-4">
        <h3 className="rule-label mb-2">Credit standing — {nation.name}</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-sm">
            <span className="rule-label">Credit tier</span>
            <select
              value={nation.credit_tier_id ?? ""}
              onChange={(e) => setTier(e.target.value)}
              disabled={busy}
              className="mt-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              {creditTiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({(t.interest_markup * 100).toFixed(2)}%)
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm">
            <div className="rule-label">Rate on new debt issued today</div>
            <div className="tabular text-lg font-semibold text-primary">
              {(issueRate * 100).toFixed(2)}%
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Changing the tier or base rate never touches debt already on file — each tranche keeps the
          rate it was issued at. Only debt filed from this point on uses the new rate.
        </p>
      </div>

      <div className="rounded border border-border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="rule-label">Debt on file</h3>
          <div className="text-right text-sm">
            <span className="text-muted-foreground">Total </span>
            <span className="tabular font-semibold">{fmtCompact(totalDebt, "C$")}</span>
            <span className="text-muted-foreground"> · interest due next year </span>
            <span className="tabular font-semibold text-loss">
              {fmtCompact(totalInterest, "C$")}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {instruments.length === 0 && (
            <p className="text-sm text-muted-foreground">No debt on file for {nation.name}.</p>
          )}
          {instruments.map((d) => (
            <div
              key={d.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDraggedInstrument(d.id);
              }}
              onDragEnd={() => setDraggedInstrument(null)}
              onDragOver={(e) => {
                if (draggedInstrument === null || draggedInstrument === d.id) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedInstrument && draggedInstrument !== d.id) {
                  void reorderInstrument(draggedInstrument, d.id);
                }
                setDraggedInstrument(null);
              }}
              className={`flex flex-wrap items-center gap-3 rounded border border-border/60 p-2 ${
                draggedInstrument === d.id ? "opacity-40" : ""
              }`}
            >
              <span
                className="cursor-grab select-none text-muted-foreground"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <div className="min-w-[140px] flex-1">
                <div className="text-sm font-medium">
                  {d.label}
                  {d.is_general && (
                    <span className="ml-2 rounded border border-border px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      general
                    </span>
                  )}
                </div>
                {d.credit_tier_name_at_issue && (
                  <div className="text-[11px] text-muted-foreground">
                    Issued at {d.credit_tier_name_at_issue}
                    {d.issued_year ? ` · ${d.issued_year}` : ""}
                  </div>
                )}
              </div>
              <label className="text-sm">
                <span className="rule-label mr-1">Principal</span>
                <NumberField
                  value={d.principal}
                  onCommit={(v) => updatePrincipal(d.id, v)}
                  className="tabular w-36 rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <div className="text-sm">
                <span className="rule-label mr-1">Rate</span>
                <span
                  className={`tabular ${d.defaulted ? "text-muted-foreground line-through" : ""}`}
                >
                  {(d.interest_rate * 100).toFixed(2)}%
                </span>
              </div>
              <label
                className="flex items-center gap-1 text-sm"
                title="A defaulted tranche still counts toward the nation's debt, but no interest accrues or is charged on it."
              >
                <input
                  type="checkbox"
                  checked={d.defaulted === true}
                  disabled={busy}
                  onChange={(e) => setDefaulted(d.id, e.target.checked)}
                />
                <span className={d.defaulted ? "font-semibold text-loss" : ""}>Defaulted</span>
              </label>
              {!d.is_general && (
                <button
                  onClick={() => removeInstrument(d.id, d.label)}
                  disabled={busy}
                  className="rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <label className="block text-sm">
            <span className="rule-label">New instrument name</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Triangulite reconstruction loan"
              className="mt-1 w-64 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="rule-label">Principal</span>
            <NumberField
              value={newPrincipal}
              onCommit={setNewPrincipal}
              className="tabular mt-1 w-32 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="rule-label">Rate (defaults to today's issue rate)</span>
            <NumberField
              value={newRateOverride ?? issueRate}
              onCommit={setNewRateOverride}
              className="tabular mt-1 w-24 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={issueDebt}
            disabled={busy}
            className="rounded border border-primary/50 px-3 py-1.5 text-sm text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            + File debt instrument
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Use this to carve out a specific contract — an international loan, a bond issue — with its
          own rate and terms, separate from the general debt pool that year-advance and treasury
          overflow adjust automatically.
        </p>
      </div>
    </div>
  );
}

function GroupNameInput({
  group,
  onRename,
}: {
  group: string;
  onRename: (from: string, to: string) => void;
}) {
  const [draft, setDraft] = useState(group);

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== group) onRename(group, trimmed);
        else setDraft(group);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(group);
      }}
      className="w-64 rounded border border-border bg-background px-2 py-1 text-sm font-semibold"
    />
  );
}
