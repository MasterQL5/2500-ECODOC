import type { Nation } from "./econ";
import {
  FOREIGN_TAX_CATEGORY,
  foreignTaxTotal,
  isForeignTaxItem,
  type ExpenditureItem,
} from "./fiscal";
import { buildContext, evalTokens, type TaxFormula } from "./formula";
import { withTaxBase } from "./rollup";

/** The locked expenditure line a taxed state carries for one tax another state levies on it. */
export function foreignTaxLine(
  taxer: Pick<Nation, "name" | "acronym">,
  tax: Pick<TaxFormula, "id" | "name" | "group_name">,
  amount: number,
): ExpenditureItem {
  return {
    label: `${tax.group_name?.trim() || tax.name} → ${taxer.name}`,
    amount,
    category: FOREIGN_TAX_CATEGORY,
    foreign_tax: true,
    charged_by: taxer.acronym,
    tax_id: tax.id,
  };
}

/** Can this state carry a foreign-tax line? A parent whose finances are the sum of its members
 * keeps no books of its own, so a tax charged to it would have nowhere to be filed. */
export function canBeCharged(nation: Nation, all: Nation[]): boolean {
  const hasMembers = all.some((n) => n.parent_acronym === nation.acronym);
  if (!hasMembers) return true;
  const f = (nation.fiscal as Record<string, unknown> | null)?.["__rollup"] as
    Record<string, unknown> | undefined;
  return !(f?.["finance"] === "sum" && f?.["debt"] !== "own" && f?.["debt"] !== "core_plus");
}

export type ForeignTaxPatch = {
  id: string;
  acronym: string;
  patch: {
    expenditure_items: NonNullable<Nation["expenditure_items"]>;
    expenditures: number;
    net_income: number | null;
  };
};

/**
 * Refile the foreign-tax lines on the given states from the taxes currently on the books, without
 * waiting for a year advance: each line is the tax's amount right now (read before any foreign tax,
 * see buildContext), the state's expenditures and net income move by the difference, and nothing
 * else about its books is touched. Treasury and debt follow at the next year advance.
 */
export function refileForeignTaxes(
  world: Nation[],
  taxes: TaxFormula[],
  formula: Record<string, number>,
  payerAcronyms: Iterable<string>,
): ForeignTaxPatch[] {
  const out: ForeignTaxPatch[] = [];
  for (const acronym of new Set(payerAcronyms)) {
    const payer = world.find((n) => n.acronym === acronym);
    if (!payer || !canBeCharged(payer, world)) continue;
    const lines: ExpenditureItem[] = [];
    for (const t of taxes) {
      if (t.charged_to !== acronym) continue;
      const taxer = world.find((n) => n.id === t.nation_id);
      if (!taxer || taxer.id === payer.id) continue;
      const ctx = buildContext(withTaxBase(taxer, world), formula, world);
      lines.push(foreignTaxLine(taxer, t, evalTokens(t.tokens, ctx)));
    }
    const kept = (payer.expenditure_items ?? []).filter((i) => !isForeignTaxItem(i));
    const before = foreignTaxTotal(payer.expenditure_items);
    const after = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
    const unchanged =
      before === after &&
      (payer.expenditure_items ?? []).filter((i) => isForeignTaxItem(i)).length === lines.length;
    if (unchanged) continue;
    const expenditures = (payer.expenditures ?? 0) - before + after;
    const net_income =
      payer.net_income !== null
        ? payer.net_income + before - after
        : payer.revenue !== null
          ? payer.revenue - expenditures
          : null;
    out.push({
      id: payer.id,
      acronym,
      patch: { expenditure_items: [...kept, ...lines], expenditures, net_income },
    });
  }
  return out;
}
