import type { Nation, Commodity } from "./econ";
import type { TaxFormula } from "./formula";
import { buildContext, totalFormulaRevenue } from "./formula";
import { expenditureBreakdown } from "./fiscal";

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
export function advanceNationYear(
  nation: Nation,
  taxes: TaxFormula[],
  formula: Record<string, number>,
): Partial<Nation> {
  const patch: Partial<Nation> = {};

  const growth = nation.growth_rate ?? 0; // nominal GDP growth, annual
  const inflation = nation.inflation_rate ?? 0; // annual inflation
  const popGrowth = nation.pop_growth ?? 0;
  const migration = nation.migration ?? 0;

  // --- GDP: nominal grows by the filed nominal growth rate; real strips out
  // inflation from that same nominal move; PPP tracks nominal proportionally
  // so the PPP conversion ratio the GM has filed keeps holding.
  let newGdpNominal = nation.gdp_nominal;
  if (nation.gdp_nominal !== null) {
    newGdpNominal = nation.gdp_nominal * (1 + growth);
    patch.gdp_nominal = newGdpNominal;
  }
  if (nation.gdp_real !== null) {
    const realGrowth = growth - inflation;
    patch.gdp_real = nation.gdp_real * (1 + realGrowth);
  }
  if (nation.gdp_ppp !== null && nation.gdp_nominal) {
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
  if (nation.population !== null) {
    newPopulation = Math.ceil(nation.population * (1 + popGrowth) + migration);
    patch.population = newPopulation;
  }

  // --- Revenue & expenditure: recompute from the nation's own filed formula
  // ledger against the *new* GDP, so revenue actually reflects this year's
  // growth instead of being carried over unchanged. A state with no filed
  // formulas keeps its previous revenue figure (nothing to recompute from).
  const nationForCtx: Nation = { ...nation, gdp_nominal: newGdpNominal ?? nation.gdp_nominal };
  const ctx = buildContext(nationForCtx, formula);
  const nationTaxes = taxes.filter((t) => t.nation_id === nation.id);
  let newRevenue = nation.revenue;
  if (nationTaxes.length > 0) {
    newRevenue = totalFormulaRevenue(nationTaxes, ctx);
    patch.revenue = newRevenue;
  }

  let newExpenditures = nation.expenditures;
  if (nation.expenditure_items && nation.expenditure_items.length > 0) {
    // Expenditure items are either fixed amounts or shares of total spend.
    // Shares scale with the (possibly just-recomputed) revenue figure so a
    // growing economy's budget grows with it; fixed amounts stay fixed
    // until the nation or GM revises them directly.
    const hasShares = nation.expenditure_items.some((i) => i.share !== undefined);
    if (hasShares) {
      const base = newRevenue ?? nation.expenditures ?? 0;
      newExpenditures = expenditureBreakdown(nation, base).reduce((s, i) => s + i.amount, 0);
      patch.expenditures = newExpenditures;
    }
  }

  if (newRevenue !== null && newExpenditures !== null) {
    const netIncome = newRevenue - newExpenditures;
    patch.net_income = netIncome;
    // Treasury is a running stock: last year's balance plus this year's net income.
    if (nation.treasury !== null) {
      patch.treasury = nation.treasury + netIncome;
    }
  }

  // --- Derived ratios recomputed from the figures above so they don't go stale.
  const finalGdpNominal = patch.gdp_nominal ?? nation.gdp_nominal;
  const finalGdpPpp = patch.gdp_ppp ?? nation.gdp_ppp;
  const finalPopulation = patch.population ?? nation.population;
  if (finalGdpNominal !== null && finalPopulation) {
    patch.gdp_per_capita = finalGdpNominal / finalPopulation;
  }
  const finalTreasury = patch.treasury ?? nation.treasury;
  const finalDebt = nation.debt; // debt is not auto-advanced; GM/nation controls it directly
  if (finalGdpPpp && (finalTreasury !== null || finalDebt !== null)) {
    patch.debt_treasury_ratio = ((finalDebt ?? 0) - (finalTreasury ?? 0)) / finalGdpPpp;
  }
  if (finalGdpNominal && newRevenue !== null) {
    patch.revenue_gdp_ratio = newRevenue / finalGdpNominal;
  }

  return patch;
}

/** Advance every nation's stats by one year. Commodities are left for the GM to revalue directly. */
export function advanceAllNations(
  nations: Nation[],
  taxes: TaxFormula[],
  formula: Record<string, number>,
): { id: string; patch: Partial<Nation> }[] {
  return nations.map((n) => ({ id: n.id, patch: advanceNationYear(n, taxes, formula) }));
}

/** Placeholder for commodities: currently untouched by year-advance (GM revalues these directly). */
export function passthroughCommodities(commodities: Commodity[]): Commodity[] {
  return commodities;
}
