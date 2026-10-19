import type { Nation } from "./econ";
import type { TaxFormula } from "./formula";
import { buildContext, evalTokens, hasInternationalTokens, totalFormulaRevenue } from "./formula";
import { expFormulasOf, ownMandatedLines } from "./expenditureFormulas";
import {
  expenditureBreakdown,
  inflatesExpenditures,
  isSystemItem,
  systemLinesTotal,
  type ExpenditureItem,
} from "./fiscal";
import { foreignTaxLine } from "./foreignTax";
import { derivedGdp } from "./econ";
import { isDebtExpenditureLabel } from "./fiscal";
import { rollupSettings, rolledStatOverrides } from "./rollup";
import {
  advanceDebtInstruments,
  applyToGeneralDebt,
  totalInterestDue,
  type DebtInstrument,
} from "./debt";

export type NationAdvanceResult = {
  patch: Partial<Nation>;
  /** This nation's debt tranches after a year of compounding and any surplus/deficit applied —
   * the caller persists these back to debt_instruments alongside the nation patch. */
  debtInstruments: DebtInstrument[];
  /** What each tax with a "charged to" state yields this year, by tax id. */
  taxAmounts: Record<string, number>;
  /** What each of this state's expenditure formulas that pays another state costs this year. */
  paymentAmounts: Record<string, number>;
};

/**
 * Advance a single nation's filed statistics by one fiscal year, using the
 * growth/inflation figures already on file for that nation (its own
 * "growth_rate", "inflation_rate", "pop_growth" etc.) rather than any
 * external assumption. Revenue and expenditure are recomputed from the
 * nation's own filed formula ledger (Formula Workbench) once GDP has moved,
 * so a state with no filed formulas keeps its revenue/expenditure figures
 * as previously registered (adjusted only by the GDP they scale from, if
 * the GM has wired that up).
 */
export type AdvanceOptions = {
  /** GDP this nation's own taxes are charged on, when that is not its own GDP row
   * (a supranational whose economy is the sum of its members). */
  taxGdp?: number | null | undefined;
  /** Every other figure a "sum" parent's formulas must read as its members' combined one (the
   * EU's population, treasury, …), struck from the members' new figures. See rolledStatOverrides. */
  rolled?: Partial<Nation>;
  /** Roll-up "sum" parents: their own row for that group is ignored, so it is not advanced. */
  skipEconomy?: boolean;
  skipPopulation?: boolean;
  skipFinance?: boolean;
  /** All nations (their current state), so international statistics in tax formulas resolve. */
  all?: Nation[];
  /** Taxes other states levy on this one this year: filed as locked lines, deducted like any spend. */
  foreignLines?: ExpenditureItem[];
  /** Money other states' formulas pay this one this year, added to its revenue. */
  transferIn?: number;
};

export function advanceNationYear(
  nation: Nation,
  taxes: TaxFormula[],
  formula: Record<string, number>,
  debtInstruments: DebtInstrument[],
  opts: AdvanceOptions = {},
): NationAdvanceResult {
  const patch: Partial<Nation> = {};

  const growth = nation.growth_rate ?? 0; // nominal GDP growth, annual
  const inflation = nation.inflation_rate ?? 0; // annual inflation
  const popGrowth = nation.pop_growth ?? 0;
  const migration = nation.migration ?? 0;

  // --- GDP: nominal grows by the filed nominal growth rate; real strips out
  // inflation from that same nominal move; PPP tracks nominal proportionally
  // so the PPP conversion ratio the GM has filed keeps holding.
  let newGdpNominal = nation.gdp_nominal;
  if (!opts.skipEconomy && nation.gdp_nominal !== null) {
    newGdpNominal = nation.gdp_nominal * (1 + growth);
    patch.gdp_nominal = newGdpNominal;
  }
  // --- Cumulative inflation ratio (since base year) compounds by this
  // year's filed inflation rate. This is what the Exchange page's parities
  // are struck from, so filing inflation now actually moves the exchange.
  if (nation.inflation_ratio !== null) {
    patch.inflation_ratio = (1 + nation.inflation_ratio) * (1 + inflation) - 1;
  }

  // --- Real and PPP GDP are never filed by hand: real = nominal ÷ (1 + inflation ratio) and
  // PPP = nominal × PPP conversion rate, struck from this year's new figures.
  if (!opts.skipEconomy) {
    const derived = derivedGdp({
      gdp_nominal: patch.gdp_nominal ?? nation.gdp_nominal,
      inflation_ratio: patch.inflation_ratio ?? nation.inflation_ratio,
      ppp_conversion: nation.ppp_conversion,
    });
    if (derived.gdp_real !== null) patch.gdp_real = derived.gdp_real;
    if (derived.gdp_ppp !== null) patch.gdp_ppp = derived.gdp_ppp;
  }

  // --- Population: grows by pop_growth, plus net migration (an absolute
  // headcount added on top, same convention the register already uses).
  let newPopulation = nation.population;
  if (!opts.skipPopulation && nation.population !== null) {
    newPopulation = Math.ceil(nation.population * (1 + popGrowth) + migration);
    patch.population = newPopulation;
  }

  if (opts.skipFinance) {
    // Finances are the sum of the subdivisions, so this row's own books are not run.
    return { patch, debtInstruments, taxAmounts: {}, paymentAmounts: {} };
  }

  // --- Debt: every tranche compounds by its own locked-in rate first, so the interest bill
  // below is charged on this year's opening balance, same as any real loan.
  let advancedDebt = advanceDebtInstruments(debtInstruments);
  const interestDue = totalInterestDue(advancedDebt);

  // --- Revenue & expenditure: recompute from the nation's own filed formula
  // ledger against the *new* GDP, so revenue actually reflects this year's
  // growth instead of being carried over unchanged. A state with no filed
  // formulas keeps its previous revenue figure (nothing to recompute from).
  const taxGdp = opts.taxGdp ?? newGdpNominal ?? nation.gdp_nominal;
  // Formulas see this year's new GDP and population, and — for a parent whose figures are the sum
  // of its subdivisions — the members' combined figures in place of the parent's own empty row.
  const nationForCtx: Nation = {
    ...nation,
    gdp_nominal: taxGdp,
    population: newPopulation ?? nation.population,
    ...(opts.rolled ?? {}),
  };
  const ctx = buildContext(nationForCtx, formula, opts.all);
  const nationTaxes = taxes.filter((t) => t.nation_id === nation.id);
  let newRevenue = nation.revenue;
  const transferIn = opts.transferIn ?? 0;
  if (nationTaxes.length > 0 || transferIn !== 0) {
    newRevenue = totalFormulaRevenue(nationTaxes, ctx) + transferIn;
    patch.revenue = newRevenue;
  }
  const taxAmounts: Record<string, number> = {};
  for (const t of nationTaxes)
    if (t.charged_to) taxAmounts[t.id] = t.disabled ? 0 : evalTokens(t.tokens, ctx);
  // The GM's expenditure formulas: locked lines on this state's own books.
  const mandated = ownMandatedLines(nation, ctx);
  const paymentAmounts: Record<string, number> = {};
  for (const l of mandated) {
    if (l.paid_to && l.formula_id) paymentAmounts[l.formula_id] = l.amount ?? 0;
  }

  // Interest payments are a locked expenditure line — always present, always exactly the sum of
  // this year's debt interest, never something a GM or player can override by hand.
  let newExpenditures = nation.expenditures;
  const inflateFactor = inflatesExpenditures(nation) && 1 + inflation > 0 ? 1 + inflation : 1;
  const foreignLines = [...(opts.foreignLines ?? []), ...mandated];
  const foreignTotal = foreignLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const previousForeign = systemLinesTotal(nation.expenditure_items);
  // Last year's system-filed lines (foreign taxes, mandated spending) are dropped, never inflated,
  // and this year's put in their place.
  const nonInterestItems = (nation.expenditure_items ?? [])
    .filter((i) => i.label !== "Interest payments" && !isSystemItem(i))
    .map((i) => {
      if (inflateFactor === 1 || isDebtExpenditureLabel(i.label)) return i; // debt lines never inflate
      // Every listed line follows inflation (or deflation): fixed amounts and shares alike.
      const scaled = { ...i };
      if (i.amount !== undefined) scaled.amount = i.amount * inflateFactor;
      if (i.share !== undefined) scaled.share = i.share * inflateFactor;
      return scaled;
    });
  if (nonInterestItems.length === 0 && foreignLines.length > 0) {
    // Unitemised spending stays accounted for once the books have lines of their own.
    const previousInterest =
      (nation.expenditure_items ?? []).find((i) => i.label === "Interest payments")?.amount ?? 0;
    const rest = Math.max(0, (nation.expenditures ?? 0) - previousInterest - previousForeign);
    if (rest > 0)
      nonInterestItems.push({ label: "Other expenditure", amount: rest * inflateFactor });
  }
  if (nonInterestItems.length > 0 || foreignLines.length > 0) {
    const hasShares = nonInterestItems.some((i) => i.share !== undefined);
    const base = newRevenue ?? nation.expenditures ?? 0;
    const nonInterestTotal = hasShares
      ? expenditureBreakdown({ ...nation, expenditure_items: nonInterestItems }, base).reduce(
          (s, i) => s + i.amount,
          0,
        )
      : nonInterestItems.reduce((s, i) => s + (i.amount ?? 0), 0);
    newExpenditures = nonInterestTotal + foreignTotal + interestDue;
    patch.expenditures = newExpenditures;
    patch.expenditure_items = [
      ...nonInterestItems,
      ...foreignLines,
      { label: "Interest payments", amount: interestDue },
    ];
  } else {
    // No expenditure breakdown filed at all yet — still charge interest on top of whatever
    // expenditure figure is on file, so debt never silently stops costing anything.
    // Last year's interest is already inside the filed figure; replace it, don't stack on it.
    const previousInterest =
      (nation.expenditure_items ?? []).find((i) => i.label === "Interest payments")?.amount ?? 0;
    // With inflation adjustment on, the non-interest part of the filed figure follows inflation too.
    newExpenditures =
      Math.max(0, (nation.expenditures ?? 0) - previousInterest - previousForeign) * inflateFactor +
      interestDue;
    patch.expenditures = newExpenditures;
    patch.expenditure_items = [{ label: "Interest payments", amount: interestDue }];
  }

  let netIncome: number | null = null;
  if (newRevenue !== null && newExpenditures !== null) {
    netIncome = newRevenue - newExpenditures;
    patch.net_income = netIncome;
  }

  // --- Treasury absorbs net income, floored at 0; anything beyond that floor spills into (or
  // is drawn down from) the general debt pool automatically, exactly as requested: "once the
  // treasury reaches 0, further deficits automatically go into the debt... surpluses
  // automatically go to paying down debt."
  if (netIncome !== null && nation.treasury !== null) {
    const rawTreasury = nation.treasury + netIncome;
    if (rawTreasury < 0) {
      patch.treasury = 0;
      advancedDebt = applyToGeneralDebt(
        advancedDebt,
        rawTreasury,
        nation.base_interest_rate ?? 0.058,
      );
    } else {
      patch.treasury = rawTreasury;
    }
  } else if (netIncome !== null && nation.treasury === null) {
    // No treasury filed yet — still let a deficit accrue as debt rather than vanishing.
    if (netIncome < 0) {
      advancedDebt = applyToGeneralDebt(
        advancedDebt,
        netIncome,
        nation.base_interest_rate ?? 0.058,
      );
    }
  }
  patch.debt = advancedDebt.reduce((s, d) => s + d.principal, 0);

  // --- Derived ratios recomputed from the figures above so they don't go stale.
  const finalGdpNominal = opts.taxGdp ?? patch.gdp_nominal ?? nation.gdp_nominal;
  const finalGdpPpp = patch.gdp_ppp ?? nation.gdp_ppp;
  const rolledPopulation = opts.rolled?.population;
  const finalPopulation =
    typeof rolledPopulation === "number"
      ? rolledPopulation
      : (patch.population ?? nation.population);
  if (finalGdpNominal !== null && finalPopulation) {
    patch.gdp_per_capita = finalGdpNominal / finalPopulation;
  }
  const finalTreasury = patch.treasury ?? nation.treasury;
  const finalDebt = patch.debt;
  if (finalGdpPpp && (finalTreasury !== null || finalDebt !== null)) {
    patch.debt_treasury_ratio = ((finalDebt ?? 0) - (finalTreasury ?? 0)) / finalGdpPpp;
  }
  if (finalGdpNominal && newRevenue !== null) {
    patch.revenue_gdp_ratio = newRevenue / finalGdpNominal;
  }

  return { patch, debtInstruments: advancedDebt, taxAmounts, paymentAmounts };
}

/** Advance every nation's stats by one year. Subdivisions go first so that a parent whose
 * economy is the sum of its members (the EU) charges its own taxes on their *new* GDP. Formulas
 * that read another nation's statistics (international) are then re-run against everyone's new
 * figures, so Tianxia taxes Velmaris's new GDP, not last year's. */
export function advanceAllNations(
  nations: Nation[],
  taxes: TaxFormula[],
  formula: Record<string, number>,
  allDebtInstruments: DebtInstrument[],
): { id: string; patch: Partial<Nation>; debtInstruments: DebtInstrument[] }[] {
  const parentAcronyms = new Set(
    nations.filter((n) => n.parent_acronym).map((n) => n.parent_acronym as string),
  );
  const isParent = (n: Nation) => parentAcronyms.has(n.acronym) && !n.parent_acronym;
  type Result = {
    id: string;
    patch: Partial<Nation>;
    debtInstruments: DebtInstrument[];
    taxAmounts: Record<string, number>;
    paymentAmounts: Record<string, number>;
  };

  const pass = (
    only: (n: Nation) => boolean,
    world: Nation[],
    results: Map<string, Result>,
    foreign?: Map<string, ExpenditureItem[]>,
    transfers?: Map<string, number>,
  ) => {
    const run = (n: Nation, extra: AdvanceOptions = {}) => {
      const fl = foreign?.get(n.id);
      const tin = transfers?.get(n.id);
      const r = advanceNationYear(
        n,
        taxes,
        formula,
        allDebtInstruments.filter((d) => d.nation_id === n.id),
        {
          all: world,
          ...(fl ? { foreignLines: fl } : {}),
          ...(tin ? { transferIn: tin } : {}),
          ...extra,
        },
      );
      results.set(n.id, {
        id: n.id,
        patch: r.patch,
        debtInstruments: r.debtInstruments,
        taxAmounts: r.taxAmounts,
        paymentAmounts: r.paymentAmounts,
      });
    };
    for (const n of nations) if (!isParent(n) && only(n)) run(n);
    const after = nations.map((n) => ({ ...n, ...(results.get(n.id)?.patch ?? {}) }) as Nation);
    for (const n of nations) {
      if (!isParent(n) || !only(n)) continue;
      const s = rollupSettings(n);
      const parentAfter = after.find((a) => a.id === n.id) as Nation;
      const rolled = rolledStatOverrides(parentAfter, after);
      const taxGdp = s.economy === "sum" ? (rolled.gdp_nominal ?? null) : undefined;
      run(n, {
        taxGdp,
        rolled,
        skipEconomy: s.economy === "sum",
        skipPopulation: s.population === "sum",
        skipFinance: s.finance === "sum" && s.debt === "sum",
      });
    }
  };

  const results = new Map<string, Result>();
  pass(() => true, nations, results);

  if (hasInternationalTokens(taxes)) {
    const withInternational = new Set(
      taxes.filter((t) => t.tokens.some((k) => k.t === "xstat")).map((t) => t.nation_id),
    );
    const world = nations.map((n) => ({ ...n, ...(results.get(n.id)?.patch ?? {}) }) as Nation);
    // Re-run only the nations that read foreign figures, from their original (pre-advance) state.
    // Their members and the nations they read are already advanced in `world`.
    pass((n) => withInternational.has(n.id), world, results);
  }

  // Taxes charged to another state: each becomes a locked expenditure line there. The payer is
  // re-run from its original state with those lines, so its net income, treasury and debt fall by
  // exactly what the taxer collects. Taxers read payers *before* the tax (see buildContext), so
  // nothing here feeds back into the amounts.
  const byAcronym = new Map(nations.map((n) => [n.acronym, n]));
  const foreign = new Map<string, ExpenditureItem[]>();
  for (const t of taxes) {
    if (!t.charged_to || t.disabled) continue;
    const taxer = nations.find((n) => n.id === t.nation_id);
    const payer = byAcronym.get(t.charged_to);
    const amount = results.get(t.nation_id)?.taxAmounts[t.id];
    if (!taxer || !payer || payer.id === taxer.id || amount === undefined) continue;
    const list = foreign.get(payer.id) ?? [];
    list.push(foreignTaxLine(taxer, t, amount));
    foreign.set(payer.id, list);
  }
  // Spending formulas that pay another state arrive there as revenue.
  const transfers = new Map<string, number>();
  for (const n of nations) {
    for (const f of expFormulasOf(n)) {
      if (!f.paid_to || f.disabled) continue;
      const to = byAcronym.get(f.paid_to);
      const amount = results.get(n.id)?.paymentAmounts[f.id];
      if (!to || to.id === n.id || amount === undefined) continue;
      transfers.set(to.id, (transfers.get(to.id) ?? 0) + amount);
    }
  }
  if (foreign.size > 0 || transfers.size > 0) {
    const world = nations.map((n) => ({ ...n, ...(results.get(n.id)?.patch ?? {}) }) as Nation);
    pass((n) => foreign.has(n.id) || transfers.has(n.id), world, results, foreign, transfers);
  }
  return nations.map((n) => results.get(n.id) as Result);
}
