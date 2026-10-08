import { RollupPanel } from "@/components/RollupPanel";
import { useState } from "react";
import { withTaxBase } from "@/lib/rollup";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BureauShell } from "@/components/BureauShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
import {
  commoditiesQuery,
  creditTiersQuery,
  currenciesQuery,
  debtInstrumentsQuery,
  formulaQuery,
  gameStateQuery,
  nationsQuery,
  rulingsQuery,
  snapshotYearsQuery,
  snapshotsForYearQuery,
  taxFormulasQuery,
} from "@/lib/queries";
import { NumberField } from "@/components/NumberField";
import { DEFAULT_EXPENDITURE_SHARES } from "@/lib/fiscal";
import { buildContext, evalTokens, standardTaxFormulaSeed } from "@/lib/formula";
import { NUMERIC_NATION_FIELDS, NATION_FIELDS } from "@/lib/econ";
import { advanceAllNations } from "@/lib/yearAdvance";

export const Route = createFileRoute("/gm")({
  head: () => ({
    meta: [
      { title: "Game Master Panel — Bureau of Interstellar Statistics" },
      {
        name: "description",
        content: "Administer national accounts, commodity prices and rulings.",
      },
      { property: "og:title", content: "Game Master Panel" },
      {
        property: "og:description",
        content: "Administer national accounts, commodity prices and rulings.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(nationsQuery),
      context.queryClient.ensureQueryData(commoditiesQuery),
      context.queryClient.ensureQueryData(rulingsQuery),
      context.queryClient.ensureQueryData(formulaQuery),
      context.queryClient.ensureQueryData(taxFormulasQuery),
      context.queryClient.ensureQueryData(currenciesQuery),
      context.queryClient.ensureQueryData(debtInstrumentsQuery),
      context.queryClient.ensureQueryData(creditTiersQuery),
      context.queryClient.ensureQueryData(snapshotYearsQuery),
    ]);
  },
  component: GmPanel,
});

function GmPanel() {
  const { isGm, loading, user } = useSession();
  const qc = useQueryClient();
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const { data: commodities } = useSuspenseQuery(commoditiesQuery);
  const { data: rulings } = useSuspenseQuery(rulingsQuery);
  const { data: formula } = useSuspenseQuery(formulaQuery);
  const { data: allTaxes } = useSuspenseQuery(taxFormulasQuery);
  const { data: currencies } = useSuspenseQuery(currenciesQuery);
  const { data: allDebtInstruments } = useSuspenseQuery(debtInstrumentsQuery);
  const { data: creditTiers } = useSuspenseQuery(creditTiersQuery);
  const { data: snapshotYears } = useSuspenseQuery(snapshotYearsQuery);

  const [nationId, setNationId] = useState<string>("");
  const [field, setField] = useState<string>(NUMERIC_NATION_FIELDS[0] ?? "");
  const [value, setValue] = useState("");
  const [commodityId, setCommodityId] = useState<string>("");
  const [price, setPrice] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [codeNationId, setCodeNationId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [editRulingId, setEditRulingId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [newAcronym, setNewAcronym] = useState("");
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [newCurrencyGroup, setNewCurrencyGroup] = useState("");
  const [newCurrencyName, setNewCurrencyName] = useState("");
  const [newCurrencySymbol, setNewCurrencySymbol] = useState("");
  const [creatingNation, setCreatingNation] = useState(false);
  const [recomputingRevenue, setRecomputingRevenue] = useState(false);
  const [revertBusy, setRevertBusy] = useState(false);
  const [revertYear, setRevertYear] = useState<number | "">("");
  const [deleteAcronym, setDeleteAcronym] = useState("");
  const [newTierName, setNewTierName] = useState("");
  const [newTierMarkup, setNewTierMarkup] = useState(0.25);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingNation, setDeletingNation] = useState(false);

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

  async function saveNationField() {
    if (!nationId || !field) return;
    const num = value === "" ? null : Number(value);
    const { error } = await supabase
      .from("nations")
      .update({ [field]: num } as never)
      .eq("id", nationId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["nations"] });
    toast.success("Figure amended");
  }

  async function saveCommodity() {
    if (!commodityId) return;
    const c = commodities.find((x) => x.id === commodityId);
    const next = price === "" ? null : Number(price);
    const { error } = await supabase
      .from("commodities")
      .update({ current_price: next, previous_price: c?.current_price ?? null })
      .eq("id", commodityId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["commodities"] });
    toast.success("Price revalued");
  }

  async function postRuling() {
    if (!title.trim()) return;
    const { error } = await supabase
      .from("rulings")
      .insert({ year: state.current_year, title, body, status: "applied" });
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    setBody("");
    await qc.invalidateQueries({ queryKey: ["rulings"] });
    toast.success("Ruling entered in the gazette");
  }

  async function advanceYear() {
    const snapshots = [
      ...nations.map((n) => ({
        year: state.current_year,
        kind: "nation",
        ref_id: n.id,
        data: n as unknown as Record<string, unknown>,
      })),
      ...commodities.map((c) => ({
        year: state.current_year,
        kind: "commodity",
        ref_id: c.id,
        data: c as unknown as Record<string, unknown>,
      })),
      ...allTaxes.map((t) => ({
        year: state.current_year,
        kind: "tax_formula",
        ref_id: t.id,
        data: t as unknown as Record<string, unknown>,
      })),
      {
        // currencies are keyed by a text "code", not a uuid, so the whole set is bundled into
        // one row under a generated id — year_snapshots.ref_id is a uuid column and has no
        // real id of its own to borrow from currencies.
        year: state.current_year,
        kind: "currencies",
        ref_id: crypto.randomUUID(),
        data: { list: currencies } as unknown as Record<string, unknown>,
      },
      {
        // same reasoning: game_state has a fixed integer id (1), not a uuid.
        year: state.current_year,
        kind: "game_state",
        ref_id: crypto.randomUUID(),
        data: { ...state, __formula: formula } as unknown as Record<string, unknown>,
      },
    ];
    const { error: snapError } = await supabase.from("year_snapshots").insert(snapshots as never);
    if (snapError) {
      toast.error(`Could not file the year: ${snapError.message}`);
      return;
    }

    // Apply each nation's own filed growth, inflation and revenue formulas to
    // roll every statistic forward one year, instead of carrying last year's
    // figures over unchanged.
    const patches = advanceAllNations(
      nations,
      allTaxes,
      formula as Record<string, number>,
      allDebtInstruments,
    );
    for (const { id, patch, debtInstruments: newInstruments } of patches) {
      if (Object.keys(patch).length > 0) {
        const { error: patchError } = await supabase
          .from("nations")
          .update(patch as never)
          .eq("id", id);
        if (patchError) {
          toast.error(`Could not update ${id}: ${patchError.message}`);
          return;
        }
      }
      for (const inst of newInstruments) {
        if (inst.id.startsWith("pending-")) {
          // A general tranche created on the fly to absorb this year's deficit — insert fresh.
          const { error: insErr } = await supabase.from("debt_instruments" as never).insert({
            nation_id: inst.nation_id,
            label: inst.label,
            principal: inst.principal,
            interest_rate: inst.interest_rate,
            is_general: inst.is_general,
            credit_tier_name_at_issue: inst.credit_tier_name_at_issue,
            issued_year: state.current_year,
          } as never);
          if (insErr) {
            toast.error(`Could not file new debt for ${id}: ${insErr.message}`);
            return;
          }
        } else {
          const { error: updErr } = await supabase
            .from("debt_instruments" as never)
            .update({ principal: inst.principal } as never)
            .eq("id", inst.id);
          if (updErr) {
            toast.error(`Could not update debt for ${id}: ${updErr.message}`);
            return;
          }
        }
      }
    }

    const { error } = await supabase
      .from("game_state")
      .update({ current_year: state.current_year + 1 })
      .eq("id", 1);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["game_state"] });
    await qc.invalidateQueries({ queryKey: ["snapshot_years"] });
    await qc.invalidateQueries({ queryKey: ["nations"] });
    await qc.invalidateQueries({ queryKey: ["debt_instruments"] });
    toast.success(
      `Fiscal year ${state.current_year + 1} opened; ${state.current_year} filed to the archive and statistics advanced`,
    );
  }

  /**
   * Restore every register (nations, commodities, tax formulas, currencies,
   * fiscal year) to exactly how it stood when the given year was filed to the
   * archive, then delete that year and every later year's snapshots — they no
   * longer describe a real history once the state has rewound past them.
   * This lets a game master move the doc forward and backward freely, e.g.
   * to test that a formula change behaves as expected before committing to it.
   */
  async function revertToYear(year: number) {
    setRevertBusy(true);
    try {
      const { data: rows, error: fetchErr } = await supabase
        .from("year_snapshots")
        .select("*")
        .eq("year", year);
      if (fetchErr) throw fetchErr;
      if (!rows || rows.length === 0) throw new Error(`No filed snapshot for year ${year}`);

      const byKind = (k: string) => rows.filter((r) => r.kind === k);

      for (const row of byKind("nation")) {
        const patch = { ...(row.data as Record<string, unknown>) };
        delete patch["id"]; // never overwrite the primary key
        const { error } = await supabase
          .from("nations")
          .update(patch as never)
          .eq("id", row.ref_id);
        if (error) throw error;
      }
      for (const row of byKind("commodity")) {
        const patch = { ...(row.data as Record<string, unknown>) };
        delete patch["id"];
        const { error } = await supabase
          .from("commodities")
          .update(patch as never)
          .eq("id", row.ref_id);
        if (error) throw error;
      }
      for (const row of byKind("tax_formula")) {
        const patch = { ...(row.data as Record<string, unknown>) };
        delete patch["id"];
        const { error } = await supabase
          .from("tax_formulas")
          .update(patch as never)
          .eq("id", row.ref_id);
        if (error) throw error;
      }
      const currenciesRow = byKind("currencies")[0];
      if (currenciesRow) {
        const saved = currenciesRow.data as { list?: Array<Record<string, unknown>> };
        for (const c of saved.list ?? []) {
          const patch = { ...c };
          const code = patch["code"];
          delete patch["code"];
          if (typeof code !== "string") continue;
          const { error } = await supabase
            .from("currencies")
            .update(patch as never)
            .eq("code", code);
          if (error) throw error;
        }
      }
      const gameStateRow = byKind("game_state")[0];
      if (gameStateRow) {
        const saved = gameStateRow.data as Record<string, unknown> & { __formula?: unknown };
        const { __formula, ...gsPatch } = saved;
        delete (gsPatch as Record<string, unknown>)["id"];
        const { error } = await supabase
          .from("game_state")
          .update(gsPatch as never)
          .eq("id", 1);
        if (error) throw error;
        if (__formula) {
          const { error: fErr } = await supabase
            .from("formula_settings")
            .update({ params: __formula } as never)
            .eq("id", 1);
          if (fErr) throw fErr;
        }
      } else {
        // Older snapshots (filed before game_state was included) at least restore the year itself.
        const { error } = await supabase
          .from("game_state")
          .update({ current_year: year })
          .eq("id", 1);
        if (error) throw error;
      }

      // The years being rewound past no longer describe real history once restored.
      const { error: delErr } = await supabase.from("year_snapshots").delete().gte("year", year);
      if (delErr) throw delErr;

      await qc.invalidateQueries();
      toast.success(`Fiscal year ${year} restored; later years cleared from the archive`);
      setRevertYear("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setRevertBusy(false);
    }
  }

  async function saveAccessCode() {
    if (!codeNationId || !accessCode) return;
    const { error } = await supabase
      .from("nation_secrets")
      .upsert({ nation_id: codeNationId, access_code: accessCode }, { onConflict: "nation_id" });
    if (error) {
      toast.error(error.message);
      return;
    }
    setAccessCode("");
    toast.success("Access code set");
  }

  async function addCreditTier() {
    const name = newTierName.trim();
    if (!name) {
      toast.error("Name the new tier");
      return;
    }
    const worstSort =
      creditTiers.length > 0 ? Math.max(...creditTiers.map((t) => t.sort_order)) : 0;
    const { error } = await supabase.from("credit_tiers" as never).insert({
      name,
      interest_markup: newTierMarkup,
      sort_order: worstSort + 10,
    } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["credit_tiers"] });
    toast.success(`${name} added`);
    setNewTierName("");
    setNewTierMarkup(0.25);
  }

  async function deleteCreditTier(id: string, name: string) {
    const fallback = creditTiers.find((t) => t.id !== id);
    if (!fallback) {
      toast.error("At least one credit tier must exist");
      return;
    }
    if (
      !window.confirm(
        `Remove ${name}? Any state currently on this tier moves to ${fallback.name}. This never changes the rate on debt already issued.`,
      )
    ) {
      return;
    }
    const { error: moveErr } = await supabase
      .from("nations")
      .update({ credit_tier_id: fallback.id, credit_rating: fallback.name } as never)
      .eq("credit_tier_id" as never, id);
    if (moveErr) {
      toast.error(moveErr.message);
      return;
    }
    const { error } = await supabase
      .from("credit_tiers" as never)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["credit_tiers"] });
    await qc.invalidateQueries({ queryKey: ["nations"] });
    toast.success(`${name} removed`);
  }

  async function recomputeAllRevenue() {
    setRecomputingRevenue(true);
    try {
      let updated = 0;
      for (const n of nations) {
        const nationTaxes = allTaxes.filter((t) => t.nation_id === n.id);
        if (nationTaxes.length === 0) continue;
        const ctx = buildContext(withTaxBase(n, nations), formula as Record<string, number>);
        const newRevenue = nationTaxes.reduce((s, t) => s + evalTokens(t.tokens, ctx), 0);
        if (newRevenue === n.revenue) continue; // already correct, skip the write
        const newNetIncome = newRevenue - (n.expenditures ?? 0);
        const { error } = await supabase
          .from("nations")
          .update({ revenue: newRevenue, net_income: newNetIncome } as never)
          .eq("id", n.id);
        if (error) throw error;
        updated++;
      }
      await qc.invalidateQueries({ queryKey: ["nations"] });
      toast.success(
        updated > 0
          ? `Recomputed revenue for ${updated} state(s) from their filed formulas`
          : "Every state's revenue already matches its filed formulas",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not recompute revenue");
    } finally {
      setRecomputingRevenue(false);
    }
  }

  async function renameCreditTier(id: string, name: string) {
    const { error } = await supabase
      .from("credit_tiers" as never)
      .update({ name } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Keep every nation currently on this tier's mirrored display name in sync, so a rename
    // shows up everywhere immediately — the nations register, the homepage, the world map —
    // without anyone needing to re-pick their tier.
    const { error: mirrorErr } = await supabase
      .from("nations")
      .update({ credit_rating: name } as never)
      .eq("credit_tier_id" as never, id);
    if (mirrorErr) {
      toast.error(`Tier renamed, but some nations' display didn't sync: ${mirrorErr.message}`);
    }
    await qc.invalidateQueries({ queryKey: ["credit_tiers"] });
    await qc.invalidateQueries({ queryKey: ["nations"] });
    toast.success("Tier renamed");
  }

  async function setCreditTierMarkup(id: string, markup: number) {
    const { error } = await supabase
      .from("credit_tiers" as never)
      .update({ interest_markup: markup } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["credit_tiers"] });
    toast.success("Markup updated — applies to new debt only");
  }

  async function saveRulingEdit() {
    if (!editRulingId) return;
    const { error } = await supabase
      .from("rulings")
      .update({ title: editTitle, body: editBody })
      .eq("id", editRulingId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["rulings"] });
    toast.success("Gazette item amended");
  }

  async function createNation() {
    const acronym = newAcronym.trim();
    const name = newName.trim();
    if (!acronym || !name) {
      toast.error("A state needs at least an acronym and a name");
      return;
    }
    if (nations.some((n) => n.acronym.toLowerCase() === acronym.toLowerCase())) {
      toast.error("That acronym is already registered");
      return;
    }
    const parent = newParent.trim() || null;
    // Subdivisions of an existing state inherit its currency bloc and take its
    // acronym prefix, matching the register's existing "USA - SLT" convention.
    const parentNation = parent ? nations.find((n) => n.acronym === parent) : null;
    const finalAcronym = parentNation ? `${parentNation.acronym} - ${acronym}` : acronym;
    const currencyGroup = parentNation
      ? (parentNation.currency_group ?? parentNation.acronym)
      : newCurrencyGroup.trim() || acronym;

    setCreatingNation(true);
    try {
      const { data: created, error } = await supabase
        .from("nations")
        .insert({
          acronym: finalAcronym,
          name,
          parent_acronym: parentNation ? parentNation.acronym : null,
          sort_order: nations.length,
          currency_group: currencyGroup,
          currency_name: parentNation ? parentNation.currency_name : newCurrencyName.trim() || null,
          currency_symbol: parentNation
            ? parentNation.currency_symbol
            : newCurrencySymbol.trim() || null,
          body: "earth",
          expenditure_items: DEFAULT_EXPENDITURE_SHARES,
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      // A brand-new (non-subdivision) currency bloc gets its own row in the
      // shared currency register so it shows up on the Exchange immediately.
      if (!parentNation && (newCurrencyName.trim() || newCurrencySymbol.trim())) {
        const { data: existingCurrency } = await supabase
          .from("currencies")
          .select("code")
          .eq("code", currencyGroup)
          .maybeSingle();
        if (!existingCurrency) {
          const { error: curErr } = await supabase.from("currencies").insert({
            code: currencyGroup,
            name: newCurrencyName.trim() || name,
            symbol: newCurrencySymbol.trim() || "",
            anchor_acronym: finalAcronym,
            sort_order: 0,
          } as never);
          if (curErr) throw curErr;
        }
      }

      // Seed the standard six revenue-line formulas, same as at initial registration.
      const seed = standardTaxFormulaSeed(created!.id as string);
      const { error: seedErr } = await supabase.from("tax_formulas").insert(seed as never);
      if (seedErr) throw seedErr;

      await qc.invalidateQueries({ queryKey: ["nations"] });
      await qc.invalidateQueries({ queryKey: ["tax_formulas"] });
      await qc.invalidateQueries({ queryKey: ["currencies"] });
      toast.success(`${name} registered with the Bureau`);
      setNewAcronym("");
      setNewName("");
      setNewParent("");
      setNewCurrencyGroup("");
      setNewCurrencyName("");
      setNewCurrencySymbol("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setCreatingNation(false);
    }
  }

  const deleteTarget = nations.find((n) => n.acronym === deleteAcronym) ?? null;
  const deleteTargetChildren = deleteTarget
    ? nations.filter((n) => n.parent_acronym === deleteTarget.acronym)
    : [];

  async function deleteNation() {
    if (!deleteTarget) return;
    if (deleteTargetChildren.length > 0) {
      toast.error("Detach this state's subdivisions on the Nations register first");
      return;
    }
    if (deleteConfirmText.trim() !== deleteTarget.acronym) {
      toast.error("Type the acronym exactly to confirm deletion");
      return;
    }
    setDeletingNation(true);
    try {
      // tax_formulas and nation_secrets cascade automatically (ON DELETE CASCADE); the
      // currencies register and any sibling nations sharing the bloc are untouched.
      const { error } = await supabase.from("nations").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["nations"] });
      await qc.invalidateQueries({ queryKey: ["tax_formulas"] });
      toast.success(`${deleteTarget.name} struck from the register`);
      setDeleteAcronym("");
      setDeleteConfirmText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete this state");
    } finally {
      setDeletingNation(false);
    }
  }

  return (
    <BureauShell>
      <div className="rule-label">Administration</div>
      <h1 className="mb-6 mt-2 text-3xl font-bold text-primary">Game-master panel</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Fiscal year — ${state.current_year}`}>
          <button
            onClick={advanceYear}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Advance to {state.current_year + 1}
          </button>
          {snapshotYears.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">
                Restore every register to how it stood at a filed year. Years after the one you pick
                are removed from the archive, since they'd no longer describe real history.
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={revertYear}
                  onChange={(e) => setRevertYear(e.target.value ? Number(e.target.value) : "")}
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Choose a filed year…</option>
                  {snapshotYears.map((y) => (
                    <option key={y} value={y}>
                      Fiscal year {y}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => revertYear !== "" && revertToYear(revertYear)}
                  disabled={revertYear === "" || revertBusy}
                  className="rounded border border-destructive/60 px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                >
                  {revertBusy ? "Restoring…" : "Revert to this year"}
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Register a new state">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="State name"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={newAcronym}
            onChange={(e) => setNewAcronym(e.target.value.toUpperCase())}
            placeholder="Acronym (e.g. ZAF)"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <Select
            value={newParent}
            onChange={setNewParent}
            placeholder="Sovereign state (optional — makes this a subdivision)"
          >
            {nations
              .filter((n) => !n.parent_acronym)
              .map((n) => (
                <option key={n.id} value={n.acronym}>
                  {n.acronym} — {n.name}
                </option>
              ))}
          </Select>
          {!newParent && (
            <>
              <p className="text-[11px] text-muted-foreground">
                A sovereign state needs its own currency. Leave blank to reuse an existing currency
                code as this state's bloc.
              </p>
              <input
                value={newCurrencyGroup}
                onChange={(e) => setNewCurrencyGroup(e.target.value.toUpperCase())}
                placeholder="Currency code (defaults to acronym)"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={newCurrencyName}
                onChange={(e) => setNewCurrencyName(e.target.value)}
                placeholder="Currency name"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={newCurrencySymbol}
                onChange={(e) => setNewCurrencySymbol(e.target.value)}
                placeholder="Currency symbol"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </>
          )}
          {newParent && (
            <p className="text-[11px] text-muted-foreground">
              Subdivisions inherit their sovereign's currency and are registered as &ldquo;
              {newParent} - {newAcronym || "ACRONYM"}&rdquo;, matching the existing convention.
            </p>
          )}
          <button
            onClick={createNation}
            disabled={creatingNation}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {creatingNation ? "Registering…" : "Register state"}
          </button>
          <p className="text-[11px] text-muted-foreground">
            The standard six revenue formulas are seeded automatically; set an access code and
            revise the formula ledger from the workbench once the state is registered.
          </p>
        </Card>

        <Card title="Strike a state from the register">
          <Select
            value={deleteAcronym}
            onChange={setDeleteAcronym}
            placeholder="Choose a state to delete"
          >
            {nations.map((n) => (
              <option key={n.id} value={n.acronym}>
                {n.acronym} — {n.name}
              </option>
            ))}
          </Select>
          {deleteTarget && deleteTargetChildren.length > 0 && (
            <p className="text-[11px] text-destructive">
              {deleteTarget.name} has {deleteTargetChildren.length} subdivision(s) — detach them on
              the Nations register before this state can be deleted.
            </p>
          )}
          {deleteTarget && deleteTargetChildren.length === 0 && (
            <>
              <p className="text-[11px] text-muted-foreground">
                This permanently deletes {deleteTarget.name}, its tax formulas, and its access code.
                This cannot be undone by the year-revert tool once the year has moved on. Type the
                acronym <span className="text-foreground">{deleteTarget.acronym}</span> to confirm.
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget.acronym}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={deleteNation}
                disabled={deletingNation || deleteConfirmText.trim() !== deleteTarget.acronym}
                className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
              >
                {deletingNation ? "Deleting…" : `Delete ${deleteTarget.acronym} permanently`}
              </button>
            </>
          )}
        </Card>

        <Card title="Amend a national figure">
          <Select
            value={nationId}
            onChange={(id) => {
              setNationId(id);
              const n = nations.find((x) => x.id === id);
              const cur = n?.[field as keyof typeof n];
              setValue(cur === null || cur === undefined ? "" : String(cur));
            }}
            placeholder="Select state"
          >
            {nations.map((n) => (
              <option key={n.id} value={n.id}>
                {n.acronym} — {n.name}
              </option>
            ))}
          </Select>
          <Select
            value={field}
            onChange={(f) => {
              setField(f);
              const n = nations.find((x) => x.id === nationId);
              const cur = n?.[f as keyof typeof n];
              setValue(cur === null || cur === undefined ? "" : String(cur));
            }}
            placeholder="Select field"
          >
            {NATION_FIELDS.filter((f) => f.format !== "text").map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="New value (blank = vacant)"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={saveNationField}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Save figure
          </button>
        </Card>

        <Card title="Revalue a commodity">
          <Select value={commodityId} onChange={setCommodityId} placeholder="Select commodity">
            {commodities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="New price"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={saveCommodity}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Save price
          </button>
        </Card>

        <Card title="Enter a ruling">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Body"
            rows={4}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={postRuling}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Publish to gazette
          </button>
        </Card>

        <Card title="Nation access codes">
          <Select value={codeNationId} onChange={setCodeNationId} placeholder="Select state">
            {nations.map((n) => (
              <option key={n.id} value={n.id}>
                {n.acronym} — {n.name}
              </option>
            ))}
          </Select>
          <input
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="New access code"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={saveAccessCode}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Set code
          </button>
        </Card>

        <RollupPanel nations={nations} isGm={isGm} />

        <Card title="Revenue formulas">
          <p className="text-xs text-muted-foreground">
            Compose each state's revenue formulas from live statistics, fiscal variables and
            constants in the dedicated workbench.
          </p>
          <Link
            to="/gm/formulas"
            className="inline-block rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Open formula workbench
          </Link>
          <button
            onClick={recomputeAllRevenue}
            disabled={recomputingRevenue}
            className="ml-2 inline-block rounded border border-primary/50 px-3 py-2 text-sm text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            {recomputingRevenue ? "Recomputing…" : "Recompute all revenue from formulas"}
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            One-off catch-up for any state whose revenue was filed before this recompute-on-save
            behaviour existed — recalculates every state's revenue from its filed formulas right
            now, without needing to open each one in the workbench individually.
          </p>
        </Card>

        <Card title="Credit tier ledger">
          <p className="text-[11px] text-muted-foreground">
            The ten standard tiers, each carrying a fixed interest markup. Renaming a tier is
            cosmetic — the level (its position AAA..D and its markup) never changes just by renaming
            it. Markups apply only to new debt issued after the change; existing debt keeps whatever
            rate it locked in when it was issued.
          </p>
          <div className="space-y-1">
            {creditTiers.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  defaultValue={t.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== t.name) renameCreditTier(t.id, name);
                    else e.target.value = t.name;
                  }}
                  className="w-28 rounded border border-border bg-background px-2 py-1"
                />
                <NumberField
                  value={t.interest_markup}
                  onCommit={(v) => setCreditTierMarkup(t.id, v)}
                  className="tabular w-24 rounded border border-border bg-background px-2 py-1 text-right"
                />
                <span className="text-muted-foreground">markup</span>
                <button
                  onClick={() => deleteCreditTier(t.id, t.name)}
                  className="ml-auto rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  title="Remove this tier — nations on it are moved to the tier below (or above, if it was the lowest)"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
            <label className="block text-sm">
              <span className="rule-label">New tier name</span>
              <input
                value={newTierName}
                onChange={(e) => setNewTierName(e.target.value)}
                placeholder="e.g. AAA+"
                className="mt-1 w-32 rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="rule-label">Markup</span>
              <NumberField
                value={newTierMarkup}
                onCommit={setNewTierMarkup}
                className="tabular mt-1 w-24 rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={addCreditTier}
              className="rounded border border-primary/50 px-3 py-1.5 text-sm text-primary hover:bg-primary hover:text-primary-foreground"
            >
              + Add tier
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            New tiers are added below the lowest existing tier (worst credit). To place one between
            two existing tiers, adjust it afterward — the ranking follows the order shown above, top
            to bottom.
          </p>
        </Card>

        <ArchiveEditor />

        <Card title="Amend a gazette item">
          <Select
            value={editRulingId}
            onChange={(id) => {
              setEditRulingId(id);
              const r = rulings.find((x) => x.id === id);
              setEditTitle(r?.title ?? "");
              setEditBody(r?.body ?? "");
            }}
            placeholder="Select ruling"
          >
            {rulings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.year} — {r.title}
              </option>
            ))}
          </Select>
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={saveRulingEdit}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Save amendment
          </button>
        </Card>
      </div>
    </BureauShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded border border-border bg-card p-4">
      <h2 className="rule-label">{title}</h2>
      {children}
    </section>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

function ArchiveEditor() {
  const qc = useQueryClient();
  const { data: years = [] } = useQuery(snapshotYearsQuery);
  const [year, setYear] = useState("");
  const { data: snaps = [] } = useQuery({
    ...snapshotsForYearQuery(Number(year)),
    enabled: year !== "",
  });
  const [snapId, setSnapId] = useState("");
  const [draft, setDraft] = useState("");

  const selected = snaps.find((s) => s.id === snapId);

  async function save() {
    if (!snapId) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error("Entry must be valid JSON");
      return;
    }
    const { error } = await supabase
      .from("year_snapshots")
      .update({ data: parsed as never })
      .eq("id", snapId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["year_snapshots", Number(year)] });
    toast.success("Archive entry amended");
  }

  return (
    <Card title="Amend an archived entry">
      <Select
        value={year}
        onChange={(y) => {
          setYear(y);
          setSnapId("");
          setDraft("");
        }}
        placeholder="Select filed year"
      >
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </Select>
      <Select
        value={snapId}
        onChange={(id) => {
          setSnapId(id);
          const s = snaps.find((x) => x.id === id);
          setDraft(s ? JSON.stringify(s.data, null, 2) : "");
        }}
        placeholder="Select record"
      >
        {snaps.map((s) => (
          <option key={s.id} value={s.id}>
            {s.kind} —{" "}
            {String(
              (s.data as Record<string, unknown>)["acronym"] ??
                (s.data as Record<string, unknown>)["name"] ??
                s.ref_id,
            )}
          </option>
        ))}
      </Select>
      {selected ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs"
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick a filed year and record to edit its figures.
        </p>
      )}
      <button
        onClick={save}
        className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        Save archive amendment
      </button>
    </Card>
  );
}
