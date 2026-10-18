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
  const {
    __custom_vars: _customVars,
    __rollup: _rollup,
    __inflate_expenditures: _inflate,
    __category_colors: _categoryColors,
    __revenue_categories: _revenueCategories,
    __revenue_category_colors: _revenueCategoryColors,
    __label_overrides: _labelOverrides,
    ...rest
  } = (nation.fiscal ?? {}) as Record<string, unknown>;
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

export type ExpenditureItem = {
  label: string;
  share?: number;
  amount?: number;
  /** Which budget category (e.g. "Defence") the line is filed under. Blank = uncategorised. */
  category?: string;
  /** Set on the locked line the system files for a tax another state levies on this one. */
  foreign_tax?: boolean;
  /** Acronym of the state that levies it, and the id of the tax row behind it. */
  charged_by?: string;
  tax_id?: string;
};

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

/** Whether this state's listed expenditures are raised or lowered by inflation each year advance. */
export const INFLATE_EXPENDITURES_KEY = "__inflate_expenditures";
export function inflatesExpenditures(nation: Pick<Nation, "fiscal">): boolean {
  return (nation.fiscal as Record<string, unknown> | null)?.[INFLATE_EXPENDITURES_KEY] === true;
}

/** Expenditure lines that belong to the debt: the locked interest bill and any "debt service"
 * line. They are never hand-edited on a nation's panel and never scaled by inflation. */
export function isDebtExpenditureLabel(label: string): boolean {
  return /^\s*(interest(\s+payments?)?|debt[\s-]*service)\s*$/i.test(label);
}

/** Reserved category for the locked debt lines. Players can't file their own lines under it. */
export const DEBT_CATEGORY = "Debt";
export const UNCATEGORISED = "Uncategorised";
/** Reserved category for taxes another state charges this one. The lines are filed by the system
 * from that state's formulas, so — like the debt lines — they are locked for everyone. */
export const FOREIGN_TAX_CATEGORY = "Foreign taxes";

export function isForeignTaxItem(i: { foreign_tax?: boolean } | null | undefined): boolean {
  return i?.foreign_tax === true;
}

/** Sum of the foreign-tax lines among a nation's filed expenditure lines. */
export function foreignTaxTotal(
  items: { amount?: number; foreign_tax?: boolean }[] | null | undefined,
): number {
  return (items ?? []).reduce((s, i) => (i.foreign_tax ? s + (i.amount ?? 0) : s), 0);
}

/** Where a nation's chosen category colours live: nation.fiscal.__category_colors. */
export const CATEGORY_COLORS_KEY = "__category_colors";

export function categoryColorsOf(nation: Pick<Nation, "fiscal">): Record<string, string> {
  const raw = (nation.fiscal as Record<string, unknown> | null)?.[CATEGORY_COLORS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v.toLowerCase();
  }
  return out;
}

/** Trim a typed category; blank (or the placeholder name) means "no category". */
export function cleanCategory(raw: unknown): string {
  const c = String(raw ?? "")
    .trim()
    .slice(0, 40);
  return c.toLowerCase() === UNCATEGORISED.toLowerCase() ? "" : c;
}

export function isReservedCategory(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === DEBT_CATEGORY.toLowerCase() ||
    n === UNCATEGORISED.toLowerCase() ||
    n === FOREIGN_TAX_CATEGORY.toLowerCase()
  );
}

export type ExpenditureLine = {
  label: string;
  amount: number;
  category: string;
  /** Debt lines: shown everywhere, edited nowhere. */
  locked: boolean;
  /** Foreign-tax lines: filed by the system for a tax another state levies; also never edited. */
  foreign: boolean;
};

/** Every expenditure line a nation lists, debt included, with its category. Lines whose amount is
 * a share of the total are resolved the same way expenditureBreakdown() resolves them. */
export function expenditureLines(
  nation: Pick<Nation, "expenditure_items" | "expenditures">,
  totalRevenue: number,
): ExpenditureLine[] {
  const items = (nation.expenditure_items ?? []) as ExpenditureItem[];
  const total = nation.expenditures ?? totalRevenue;
  const source = items.length > 0 ? items : DEFAULT_EXPENDITURE_SHARES;
  return source.map((i) => {
    const foreign = isForeignTaxItem(i);
    const locked = !foreign && isDebtExpenditureLabel(i.label);
    return {
      label: i.label,
      amount: i.amount ?? (i.share ?? 0) * total,
      category: foreign
        ? FOREIGN_TAX_CATEGORY
        : locked
          ? DEBT_CATEGORY
          : cleanCategory(i.category) || UNCATEGORISED,
      locked,
      foreign,
    };
  });
}

/** Revenue streams are set by the Bureau, but a state may file each one under a category of its
 * own. Stored by stream name in nation.fiscal.__revenue_categories, with the chosen colours in
 * __revenue_category_colors, so they survive the Bureau re-saving its formulas. */
export const REVENUE_CATEGORIES_KEY = "__revenue_categories";
export const REVENUE_CATEGORY_COLORS_KEY = "__revenue_category_colors";

function stringMap(raw: unknown, valid: (v: string) => boolean): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && valid(v)) out[k] = v;
  }
  return out;
}

export function revenueCategoriesOf(nation: Pick<Nation, "fiscal">): Record<string, string> {
  const raw = (nation.fiscal as Record<string, unknown> | null)?.[REVENUE_CATEGORIES_KEY];
  return stringMap(raw, (v) => cleanCategory(v) !== "");
}

export function revenueCategoryColorsOf(nation: Pick<Nation, "fiscal">): Record<string, string> {
  const raw = (nation.fiscal as Record<string, unknown> | null)?.[REVENUE_CATEGORY_COLORS_KEY];
  return stringMap(raw, (v) => /^#[0-9a-f]{6}$/i.test(v));
}
