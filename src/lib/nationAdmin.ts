import { supabase } from "@/integrations/supabase/client";
import type { Nation } from "./econ";
import { EXP_FORMULAS_KEY } from "./expenditureFormulas";
import type { FormulaToken } from "./formula";

export type CurrencyChoice =
  | { mode: "keep" }
  | { mode: "parent" }
  | { mode: "own"; code: string; name: string; symbol: string };

export type ReidentifyOptions = {
  /** The acronym the state will carry afterwards (for a subdivision, the full "PARENT - XX"). */
  newAcronym: string;
  /** Cut the state loose from its overlord so it becomes a sovereign state. */
  detach: boolean;
  currency: CurrencyChoice;
};

/** Strip a "PARENT - " prefix. */
export function bareAcronymOf(acronym: string): string {
  const parts = acronym.split(" - ");
  return parts[parts.length - 1]!.trim();
}

/**
 * Change a state's acronym and/or overlord and/or currency in place. Its id — and so its books,
 * history, debt, access code and formulas — is untouched; every place that refers to it by
 * acronym (its subdivisions, other states' formulas that read its statistics, taxes charged to
 * it, locked spending lines, the currency register) is updated to follow. Game-master only.
 */
export async function reidentifyNation(
  nation: Nation,
  nations: Nation[],
  opts: ReidentifyOptions,
): Promise<void> {
  const oldAcronym = nation.acronym;
  const newAcronym = opts.newAcronym.trim();
  if (!newAcronym) throw new Error("The acronym cannot be blank");
  if (
    newAcronym.toLowerCase() !== oldAcronym.toLowerCase() &&
    nations.some((n) => n.acronym.toLowerCase() === newAcronym.toLowerCase())
  ) {
    throw new Error(`"${newAcronym}" is already registered`);
  }
  if (opts.detach && !nation.parent_acronym) throw new Error("This state has no overlord");

  // Every acronym that changes: this state's, and its subdivisions' ("OLD - XX" → "NEW - XX").
  const renames = new Map<string, string>();
  if (newAcronym !== oldAcronym) renames.set(oldAcronym, newAcronym);
  const children = nations.filter((n) => n.parent_acronym === oldAcronym);
  for (const c of children) {
    const prefix = `${oldAcronym} - `;
    if (renames.has(oldAcronym) && c.acronym.startsWith(prefix)) {
      renames.set(c.acronym, `${newAcronym} - ${c.acronym.slice(prefix.length)}`);
    }
  }

  // Currency fields for the state (and any subdivision that followed it into its bloc).
  let currencyPatch: Record<string, unknown> = {};
  if (opts.currency.mode === "own") {
    const { code, name, symbol } = opts.currency;
    if (!code.trim()) throw new Error("The new currency needs a code");
    const { data: existing } = await supabase
      .from("currencies")
      .select("code")
      .eq("code", code.trim())
      .maybeSingle();
    if (existing) throw new Error(`A currency with the code "${code.trim()}" already exists`);
    const { error } = await supabase.from("currencies").insert({
      code: code.trim(),
      name: name.trim() || code.trim(),
      symbol: symbol.trim(),
      anchor_acronym: newAcronym,
      sort_order: 0,
    } as never);
    if (error) throw error;
    currencyPatch = {
      currency_group: code.trim(),
      currency_name: name.trim() || code.trim(),
      currency_symbol: symbol.trim(),
    };
  } else if (opts.currency.mode === "parent") {
    const parent = nations.find((n) => n.acronym === nation.parent_acronym);
    if (!parent || opts.detach) throw new Error("There is no overlord to take a currency from");
    currencyPatch = {
      currency_group: parent.currency_group ?? parent.acronym,
      currency_name: parent.currency_name,
      currency_symbol: parent.currency_symbol,
    };
  }

  const patch: Record<string, unknown> = {
    acronym: newAcronym,
    ...(opts.detach ? { parent_acronym: null } : {}),
    ...currencyPatch,
  };
  const { error: nErr } = await supabase
    .from("nations")
    .update(patch as never)
    .eq("id", nation.id);
  if (nErr) throw nErr;

  const oldGroup = nation.currency_group ?? oldAcronym;
  for (const c of children) {
    const next: Record<string, unknown> = {};
    if (renames.has(oldAcronym)) next["parent_acronym"] = newAcronym;
    const renamed = renames.get(c.acronym);
    if (renamed) next["acronym"] = renamed;
    if (opts.currency.mode === "own" && (c.currency_group ?? c.parent_acronym) === oldGroup) {
      Object.assign(next, currencyPatch);
    }
    if (Object.keys(next).length === 0) continue;
    const { error } = await supabase
      .from("nations")
      .update(next as never)
      .eq("id", c.id);
    if (error) throw error;
  }

  if (renames.size === 0) return;

  // The currency register's anchors.
  for (const [from, to] of renames) {
    const { error } = await supabase
      .from("currencies")
      .update({ anchor_acronym: to } as never)
      .eq("anchor_acronym", from);
    if (error) throw error;
  }

  // Formulas that read a renamed state's statistics, and taxes charged to it.
  let taxes: { id: string; tokens: FormulaToken[]; charged_to?: string | null }[] = [];
  {
    const withCharged = await supabase.from("tax_formulas").select("id,tokens,charged_to");
    if (!withCharged.error) {
      taxes = (withCharged.data ?? []) as unknown as typeof taxes;
    } else {
      const plain = await supabase.from("tax_formulas").select("id,tokens");
      if (plain.error) throw plain.error;
      taxes = (plain.data ?? []) as unknown as typeof taxes;
    }
  }
  for (const t of taxes) {
    const tokens = (t.tokens ?? []).map((k) =>
      k.t === "xstat" && renames.has(k.n) ? { ...k, n: renames.get(k.n)! } : k,
    );
    const tokensChanged = tokens.some((k, i) => k !== t.tokens[i]);
    const charged = t.charged_to && renames.has(t.charged_to) ? renames.get(t.charged_to)! : null;
    if (!tokensChanged && !charged) continue;
    const { error } = await supabase
      .from("tax_formulas")
      .update({
        ...(tokensChanged ? { tokens } : {}),
        ...(charged ? { charged_to: charged } : {}),
      } as never)
      .eq("id", t.id);
    if (error) throw error;
  }

  // Locked lines and expenditure formulas that name a renamed state.
  const { data: rows, error: rErr } = await supabase
    .from("nations")
    .select("id,expenditure_items,fiscal");
  if (rErr) throw rErr;
  for (const row of (rows ?? []) as unknown as {
    id: string;
    expenditure_items: Record<string, unknown>[] | null;
    fiscal: Record<string, unknown> | null;
  }[]) {
    let changed = false;
    const items = (row.expenditure_items ?? []).map((i) => {
      let next = i;
      for (const key of ["charged_by", "paid_to"]) {
        const v = i[key];
        if (typeof v === "string" && renames.has(v)) next = { ...next, [key]: renames.get(v)! };
      }
      if (next !== i) changed = true;
      return next;
    });
    let fiscal = row.fiscal;
    const formulas = fiscal?.[EXP_FORMULAS_KEY];
    if (fiscal && Array.isArray(formulas)) {
      const nextFormulas = formulas.map((f: Record<string, unknown>) =>
        typeof f["paid_to"] === "string" && renames.has(f["paid_to"] as string)
          ? { ...f, paid_to: renames.get(f["paid_to"] as string)! }
          : f,
      );
      if (nextFormulas.some((f, i) => f !== formulas[i])) {
        fiscal = { ...fiscal, [EXP_FORMULAS_KEY]: nextFormulas };
        changed = true;
      }
    }
    if (!changed) continue;
    const { error } = await supabase
      .from("nations")
      .update({ expenditure_items: items, ...(fiscal ? { fiscal } : {}) } as never)
      .eq("id", row.id);
    if (error) throw error;
  }
}
