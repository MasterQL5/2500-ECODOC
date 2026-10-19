import type { Nation } from "./econ";
import {
  FOREIGN_TAX_CATEGORY,
  isSystemItem,
  systemLinesTotal,
  type ExpenditureItem,
} from "./fiscal";
import { buildContext, evalTokens, taxValue, type TaxFormula } from "./formula";
import { incomingTransfers, ownMandatedLines } from "./expenditureFormulas";
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

export type LockedPatch = {
  id: string;
  acronym: string;
  patch: {
    expenditure_items: NonNullable<Nation["expenditure_items"]>;
    expenditures: number;
    net_income: number | null;
    revenue?: number;
  };
};

/**
 * Refile, for the given states, everything the system files by itself: the foreign-tax lines other
 * states' taxes put on them, the lines of their own GM expenditure formulas, and the revenue they
 * receive from other states' payments — without waiting for a year advance. Each figure is read
 * right now (other states before any foreign tax, see buildContext); expenditures, net income and
 * revenue move by the difference and nothing else about the books is touched. Treasury and debt
 * follow at the next year advance.
 */
export function refileLockedLines(
  world: Nation[],
  taxes: TaxFormula[],
  formula: Record<string, number>,
  acronyms: Iterable<string>,
  /** States whose revenue is refiled even with no taxes or transfers on the books (a state that
   * has just struck out its last tax goes to zero). */
  forceRevenue: Iterable<string> = [],
): LockedPatch[] {
  const forced = new Set(forceRevenue);
  const out: LockedPatch[] = [];
  for (const acronym of new Set(acronyms)) {
    const nation = world.find((n) => n.acronym === acronym);
    if (!nation) continue;
    // A state whose finances are the sum of its members keeps no lines of its own.
    const holds = canBeCharged(nation, world);
    const ctx = buildContext(withTaxBase(nation, world), formula, world);

    const lines: ExpenditureItem[] = [];
    for (const t of holds ? taxes : []) {
      if (t.charged_to !== acronym || t.disabled) continue;
      const taxer = world.find((n) => n.id === t.nation_id);
      if (!taxer || taxer.id === nation.id) continue;
      const tctx = buildContext(withTaxBase(taxer, world), formula, world);
      lines.push(foreignTaxLine(taxer, t, evalTokens(t.tokens, tctx)));
    }
    if (holds) lines.push(...ownMandatedLines(nation, ctx));

    const items = nation.expenditure_items ?? [];
    const before = holds ? systemLinesTotal(items) : 0;
    const after = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
    let kept = holds ? items.filter((i) => !isSystemItem(i)) : items;
    // Unitemised spending stays accounted for once the books have lines of their own.
    if (kept.length === 0 && lines.length > 0) {
      const rest = (nation.expenditures ?? 0) - before;
      if (rest > 0) kept = [{ label: "Other expenditure", amount: rest }];
    }
    const expenditures = (nation.expenditures ?? 0) - before + after;

    const hasTaxes = taxes.some((t) => t.nation_id === nation.id);
    const transfers = incomingTransfers(nation, world, formula);
    let revenue: number | undefined;
    if (hasTaxes || transfers.length > 0 || forced.has(acronym)) {
      revenue =
        taxes.filter((t) => t.nation_id === nation.id).reduce((s, t) => s + taxValue(t, ctx), 0) +
        transfers.reduce((s, r) => s + r.value, 0);
    }
    const newRevenue = revenue ?? nation.revenue;
    const net_income = newRevenue !== null ? newRevenue - expenditures : null;

    const sameLines =
      (!holds || items.filter((i) => isSystemItem(i)).length === lines.length) &&
      Math.abs(before - after) < 1e-9;
    const sameRevenue = revenue === undefined || revenue === nation.revenue;
    if (sameLines && sameRevenue && (nation.expenditures ?? 0) === expenditures) continue;
    out.push({
      id: nation.id,
      acronym,
      patch: {
        expenditure_items: holds ? [...kept, ...lines] : kept,
        expenditures,
        net_income,
        ...(revenue !== undefined ? { revenue } : {}),
      },
    });
  }
  return out;
}
