import type { Nation } from "./econ";
import { MANDATED_CATEGORY, type ExpenditureItem } from "./fiscal";
import {
  buildContext,
  evalTokens,
  taxValue,
  type FormulaContext,
  type FormulaToken,
  type TaxFormula,
} from "./formula";
import { withTaxBase } from "./rollup";

/** An expenditure the GM sets by formula. It is filed on the state as a locked line, and — when it
 * pays another state — arrives there as a revenue stream. Stored in nation.fiscal. */
export type ExpFormula = {
  id: string;
  name: string;
  tokens: FormulaToken[];
  /** Acronym of the state the money goes to. Null/absent: spent domestically. */
  paid_to?: string | null;
  disabled?: boolean;
};

export const EXP_FORMULAS_KEY = "__exp_formulas";

export function expFormulasOf(nation: Pick<Nation, "fiscal">): ExpFormula[] {
  const raw = (nation.fiscal as Record<string, unknown> | null)?.[EXP_FORMULAS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is ExpFormula =>
      !!f &&
      typeof f === "object" &&
      typeof (f as ExpFormula).id === "string" &&
      Array.isArray((f as ExpFormula).tokens),
  );
}

export function expFormulaValue(f: Pick<ExpFormula, "tokens" | "disabled">, ctx: FormulaContext) {
  return f.disabled ? 0 : evalTokens(f.tokens, ctx);
}

export function mandatedLine(f: ExpFormula, amount: number): ExpenditureItem {
  return {
    label: f.paid_to ? `${f.name} → ${f.paid_to}` : f.name,
    amount,
    category: MANDATED_CATEGORY,
    mandated: true,
    formula_id: f.id,
    ...(f.paid_to ? { paid_to: f.paid_to } : {}),
  };
}

/** The locked lines a state's own (enabled) expenditure formulas file this year. */
export function ownMandatedLines(nation: Nation, ctx: FormulaContext): ExpenditureItem[] {
  return expFormulasOf(nation)
    .filter((f) => !f.disabled)
    .map((f) => mandatedLine(f, expFormulaValue(f, ctx)));
}

export type Stream = { id: string; name: string; value: number };

/** Money other states' formulas pay to this one. */
export function incomingTransfers(
  nation: Nation,
  world: Nation[],
  formula: Record<string, number>,
): Stream[] {
  const out: Stream[] = [];
  for (const p of world) {
    if (p.id === nation.id) continue;
    const list = expFormulasOf(p).filter((f) => !f.disabled && f.paid_to === nation.acronym);
    if (list.length === 0) continue;
    const ctx = buildContext(withTaxBase(p, world), formula, world);
    for (const f of list) {
      out.push({
        id: `transfer:${p.id}:${f.id}`,
        name: `${f.name} ← ${p.name}`,
        value: expFormulaValue(f, ctx),
      });
    }
  }
  return out;
}

/** A state's revenue streams: its tax formulas (disabled ones count as zero) plus whatever other
 * states pay it. */
export function revenueStreamsFor(
  nation: Nation,
  world: Nation[],
  allTaxes: TaxFormula[],
  formula: Record<string, number>,
): (Stream & { tax: TaxFormula | null })[] {
  const ctx = buildContext(withTaxBase(nation, world), formula, world);
  return [
    ...allTaxes
      .filter((t) => t.nation_id === nation.id)
      .map((t) => ({ id: t.id, name: t.name, value: taxValue(t, ctx), tax: t })),
    ...incomingTransfers(nation, world, formula).map((s) => ({ ...s, tax: null })),
  ];
}
