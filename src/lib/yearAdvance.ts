import type { Nation, Commodity } from "./econ";
import type { TaxFormula } from "./formula";
import { buildContext, hasInternationalTokens, totalFormulaRevenue } from "./formula";
import { expenditureBreakdown } from "./fiscal";
import { rollupSettings, rolledValue } from "./rollup";
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
  /** Roll-up "sum" parents: their own row for that group is ignored, so it is not advanced. */
  skipEconomy?: boolean;
  skipPopulation?: boolean;
  skipFinance?: boolean;
  /** All nations (their current state), so international statistics in tax formulas resolve. */
  all?: Nation[];
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
  if (!opts.skipEconomy && nation.gdp_real !== null) {
    const realGrowth = growth - inflation;
    patch.gdp_real = nation.gdp_real * (1 + realGrowth);
  }
  if (opts.skipEconomy) {
    // own GDP row is ignored for this parent
  } else if (nation.gdp_ppp !== null && nation.gdp_nominal) {
    // keep gdp_ppp scaled to gdp_nominal by whatever ratio was already filed
    const ratio = nation.gdp_ppp / nation.gdp_nominal;
    patch.gdp_ppp = (newGdpNominal ?? nation.gdp_nominal) * ratio;
  } else if (nation.gdp_ppp !== null) {
    patch.gdp_ppp = nation.gdp_ppp * (1 + growth);
  }

  // --- Cumulative inflation ratio (since base year) compounds by this
  // year's filed inflation rate. This is what the Exchange page's parities
  // are struck from, so filing inflation now actually moves the exchange.
  if (nation.inflation_ratio !== null) {
    patch.inflation_ratio = (1 + nation.inflation_ratio) * (1 + inflation) - 1;
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
    return { patch, debtInstruments };
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
  const nationForCtx: Nation = { ...nation, gdp_nominal: taxGdp };
  const ctx = buildContext(nationForCtx, formula, opts.all);
  const nationTaxes = taxes.filter((t) => t.nation_id === nation.id);
  let newRevenue = nation.revenue;
  if (nationTaxes.length > 0) {
    newRevenue = totalFormulaRevenue(nationTaxes, ctx);
    patch.revenue = newRevenue;
  }

  // Interest payments are a locked expenditure line — always present, always exactly the sum of
  // this year's debt interest, never something a GM or player can override by hand.
  let newExpenditures = nation.expenditures;
  const nonInterestItems = (nation.expenditure_items ?? []).filter(
    (i) => i.label !== "Interest payments",
  );
  if (nonInterestItems.length > 0) {
    const hasShares = nonInterestItems.some((i) => i.share !== undefined);
    const base = newRevenue ?? nation.expenditures ?? 0;
    const nonInterestTotal = hasShares
      ? expenditureBreakdown({ ...nation, expenditure_items: nonInterestItems }, base).reduce(
          (s, i) => s + i.amount,
          0,
        )
      : nonInterestItems.reduce((s, i) => s + (i.amount ?? 0), 0);
    newExpenditures = nonInterestTotal + interestDue;
    patch.expenditures = newExpenditures;
    patch.expenditure_items = [
      ...nonInterestItems,
      { label: "Interest payments", amount: interestDue },
    ];
  } else {
    // No expenditure breakdown filed at all yet — still charge interest on top of whatever
    // expenditure figure is on file, so debt never silently stops costing anything.
    // Last year's interest is already inside the filed figure; replace it, don't stack on it.
    const previousInterest =
      (nation.expenditure_items ?? []).find((i) => i.label === "Interest payments")?.amount ?? 0;
    newExpenditures = Math.max(0, (nation.expenditures ?? 0) - previousInterest) + interestDue;
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
  const finalPopulation = patch.population ?? nation.population;
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

  return { patch, debtInstruments: advancedDebt };
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
  type Result = { id: string; patch: Partial<Nation>; debtInstruments: DebtInstrument[] };

  const pass = (only: (n: Nation) => boolean, world: Nation[], results: Map<string, Result>) => {
    const run = (n: Nation, extra: AdvanceOptions = {}) => {
      const r = advanceNationYear(
        n,
        taxes,
        formula,
        allDebtInstruments.filter((d) => d.nation_id === n.id),
        { all: world, ...extra },
      );
      results.set(n.id, { id: n.id, patch: r.patch, debtInstruments: r.debtInstruments });
    };
    for (const n of nations) if (!isParent(n) && only(n)) run(n);
    const after = nations.map((n) => ({ ...n, ...(results.get(n.id)?.patch ?? {}) }) as Nation);
    for (const n of nations) {
      if (!isParent(n) || !only(n)) continue;
      const s = rollupSettings(n);
      const parentAfter = after.find((a) => a.id === n.id) as Nation;
      const taxGdp =
        s.economy === "sum" ? rolledValue(parentAfter, after, "gdp_nominal").value : undefined;
      run(n, {
        taxGdp,
        skipEconomy: s.economy === "sum",
        skipPopulation: s.population === "sum",
        skipFinance: s.finance === "sum",
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
  return nations.map((n) => results.get(n.id) as Result);
}

/** Placeholder for commodities: currently untouched by year-advance (GM revalues these directly). */
export function passthroughCommodities(commodities: Commodity[]): Commodity[] {
  return commodities;
}
