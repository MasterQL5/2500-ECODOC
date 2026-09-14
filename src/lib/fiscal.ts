import type { Nation } from "./econ";

export type FiscalParams = {
  labor_share_gdp: number;
  labor_participation: number;
  income_tax_rate: number;
  manufacturing_multiplier: number;
  corporate_share_go: number;
  mean_profit_margin: number;
  corporate_tax_rate: number;
  urban_acres: number;
  urban_value: number;
  urban_lvt_rate: number;
  suburban_acres: number;
  suburban_value: number;
  suburban_lvt_rate: number;
  rural_acres: number;
  rural_value: number;
  rural_lvt_rate: number;
  excise_revenue: number;
};

export const FISCAL_DEFAULTS: FiscalParams = {
  labor_share_gdp: 0.59,
  labor_participation: 0.65,
  income_tax_rate: 0.07,
  manufacturing_multiplier: 1.5,
  corporate_share_go: 0.65,
  mean_profit_margin: 0.2,
  corporate_tax_rate: 0.07,
  urban_acres: 0,
  urban_value: 1_500_000,
  urban_lvt_rate: 0.031,
  suburban_acres: 0,
  suburban_value: 300_000,
  suburban_lvt_rate: 0.016,
  rural_acres: 0,
  rural_value: 9_000,
  rural_lvt_rate: 0,
  excise_revenue: 0,
};

export const TAX_RATE_KEYS = [
  "income_tax_rate",
  "corporate_tax_rate",
  "urban_lvt_rate",
  "suburban_lvt_rate",
  "rural_lvt_rate",
] as const;

export type TaxRateKey = (typeof TAX_RATE_KEYS)[number];

export const TAX_LABELS: Record<TaxRateKey, string> = {
  income_tax_rate: "Income tax",
  corporate_tax_rate: "Corporate tax",
  urban_lvt_rate: "Urban land value tax",
  suburban_lvt_rate: "Suburban land value tax",
  rural_lvt_rate: "Rural land value tax",
};

export function fiscalOf(
  nation: Pick<Nation, "fiscal">,
  fallback?: Partial<FiscalParams>,
): FiscalParams {
  const { __custom_vars: _customVars, ...rest } = (nation.fiscal ?? {}) as Record<string, unknown>;
  return { ...FISCAL_DEFAULTS, ...(fallback ?? {}), ...(rest as Partial<FiscalParams>) };
}

export type RevenueBreakdown = {
  income: number;
  corporate: number;
  lvt_urban: number;
  lvt_suburban: number;
  lvt_rural: number;
  excise: number;
  total: number;
};

export function computeRevenue(gdp: number | null, p: FiscalParams): RevenueBreakdown {
  const g = gdp ?? 0;
  const income = g * p.labor_share_gdp * p.labor_participation * p.income_tax_rate;
  const corporate =
    g *
    p.manufacturing_multiplier *
    p.corporate_share_go *
    p.mean_profit_margin *
    p.corporate_tax_rate;
  const lvt_urban = p.urban_acres * p.urban_value * p.urban_lvt_rate;
  const lvt_suburban = p.suburban_acres * p.suburban_value * p.suburban_lvt_rate;
  const lvt_rural = p.rural_acres * p.rural_value * p.rural_lvt_rate;
  const excise = p.excise_revenue;
  return {
    income,
    corporate,
    lvt_urban,
    lvt_suburban,
    lvt_rural,
    excise,
    total: income + corporate + lvt_urban + lvt_suburban + lvt_rural + excise,
  };
}

export type ExpenditureItem = { label: string; share?: number; amount?: number };

export const DEFAULT_EXPENDITURE_SHARES: ExpenditureItem[] = [
  { label: "Defence & fleet", share: 0.22 },
  { label: "Health & sanitation", share: 0.2 },
  { label: "Education & research", share: 0.15 },
  { label: "Infrastructure & orbital works", share: 0.14 },
  { label: "Social security", share: 0.13 },
  { label: "Administration", share: 0.08 },
  { label: "Debt service", share: 0.08 },
];

export function expenditureBreakdown(
  nation: Pick<Nation, "expenditure_items" | "expenditures">,
  totalRevenue: number,
): { label: string; amount: number }[] {
  const items = (nation.expenditure_items ?? []) as ExpenditureItem[];
  const total = nation.expenditures ?? totalRevenue;
  const source = items.length > 0 ? items : DEFAULT_EXPENDITURE_SHARES;
  return source.map((i) => ({
    label: i.label,
    amount: i.amount ?? (i.share ?? 0) * total,
  }));
}
