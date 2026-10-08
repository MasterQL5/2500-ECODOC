import { rolledTotal } from "./rollup";

export type Nation = {
  id: string;
  acronym: string;
  name: string;
  parent_acronym: string | null;
  sort_order: number;
  map_x: number | null;
  map_y: number | null;
  inflation_rate: number | null;
  inflation_ratio: number | null;
  ppp_conversion: number | null;
  gdp_nominal: number | null;
  gdp_real: number | null;
  gdp_ppp: number | null;
  growth_rate: number | null;
  revenue: number | null;
  expenditures: number | null;
  net_income: number | null;
  treasury: number | null;
  debt: number | null;
  population: number | null;
  pop_growth: number | null;
  migration: number | null;
  gdp_per_capita: number | null;
  debt_treasury_ratio: number | null;
  revenue_gdp_ratio: number | null;
  credit_score_tri: number | null;
  credit_rating: string | null;
  /** Optional because the generated Supabase types predate these columns on some deployments —
   * same reasoning as display_acronym below. */
  base_interest_rate?: number;
  credit_tier_id?: string | null;
  notes: string | null;
  flag_emoji: string | null;
  currency_group: string | null;
  currency_name: string | null;
  currency_symbol: string | null;
  body: string;
  fiscal: Record<string, number | unknown> | null;
  expenditure_items: { label: string; share?: number; amount?: number }[] | null;
  summary: string | null;
  info_rows: { label: string; value: string }[] | null;
  flag_url: string | null;
};

/** Rows every registry starts with on its INFORMATION tab. */
export const DEFAULT_INFO_ROWS: { label: string; value: string }[] = [
  "National motto",
  "Government",
  "Capital",
  "Head of state",
  "Head of government",
  "National language",
  "Dominant language",
  "Major languages",
  "Minor languages",
  "Largest city/cities",
  "State religion",
  "State anthem",
  "Demonyms",
  "Currency",
  "Population",
].map((label) => ({ label, value: "" }));

/**
 * A parent's figure for an additive field, honouring its per-statistic roll-up setting
 * (sum of subdivisions / own + subdivisions / own only). See lib/rollup.ts.
 */
export function nationTotal(
  nation: Nation,
  allNations: Nation[],
  key: keyof Nation,
): number | null {
  return rolledTotal(nation, allNations, key);
}

export const ADDITIVE_FIELDS = new Set<string>([
  "gdp_nominal",
  "gdp_real",
  "gdp_ppp",
  "revenue",
  "expenditures",
  "net_income",
  "treasury",
  "debt",
  "population",
  "migration",
]);

export type Commodity = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  base_price: number | null;
  current_price: number | null;
  previous_price: number | null;
  sort_order: number;
  notes: string | null;
  quantity: number;
  description: string | null;
};

export type RulingEffect = {
  kind: "nation" | "commodity";
  target: string;
  field: string;
  op: "set" | "add" | "mult" | "pct";
  value: number;
};

export type Ruling = {
  id: string;
  year: number;
  title: string;
  body: string | null;
  effects: RulingEffect[];
  status: string;
  applied_at: string | null;
  created_at: string;
};

export type GameState = {
  id: number;
  current_year: number;
  currency_code: string;
  bureau_name: string;
  base_year: number;
};

export type FieldFormat = "money" | "pct" | "num" | "population" | "ratio" | "text";

export type FieldDef = {
  key: keyof Nation;
  label: string;
  group: "Economic" | "Fiscal" | "Demographic" | "Misc";
  format: FieldFormat;
};

export const NATION_FIELDS: FieldDef[] = [
  { key: "inflation_rate", label: "Inflation (yearly rate)", group: "Economic", format: "pct" },
  { key: "inflation_ratio", label: "Inflation ratio", group: "Economic", format: "ratio" },
  { key: "ppp_conversion", label: "PPP conversion rate", group: "Economic", format: "ratio" },
  { key: "gdp_nominal", label: "GDP — nominal", group: "Economic", format: "money" },
  { key: "gdp_real", label: "GDP — real", group: "Economic", format: "money" },
  { key: "gdp_ppp", label: "GDP — PPP", group: "Economic", format: "money" },
  { key: "growth_rate", label: "Growth rate (nominal)", group: "Economic", format: "pct" },
  { key: "revenue", label: "Revenue", group: "Fiscal", format: "money" },
  { key: "expenditures", label: "Expenditures", group: "Fiscal", format: "money" },
  { key: "net_income", label: "Net income", group: "Fiscal", format: "money" },
  { key: "treasury", label: "Treasury", group: "Fiscal", format: "money" },
  { key: "debt", label: "Debt", group: "Fiscal", format: "money" },
  { key: "population", label: "Population", group: "Demographic", format: "population" },
  { key: "pop_growth", label: "Population growth", group: "Demographic", format: "pct" },
  { key: "migration", label: "Annual migration", group: "Demographic", format: "num" },
  { key: "gdp_per_capita", label: "GDP per capita (Nominal)", group: "Misc", format: "money" },
  {
    key: "debt_treasury_ratio",
    label: "Debt/treasury to GDP (PPP)",
    group: "Misc",
    format: "ratio",
  },
  { key: "revenue_gdp_ratio", label: "Revenue to GDP ratio", group: "Misc", format: "ratio" },
  { key: "credit_rating", label: "Credit rating", group: "Misc", format: "text" },
];

/** Fields whose real value is always derived from the tax-formula ledger and should never be
 * hand-typed anywhere on the sheet — a manual edit would silently detach the figure from the
 * formulas that are supposed to govern it. These only change via the Formula Workbench (on
 * save) or a full year-advance. */
export const FORMULA_LOCKED_FIELDS = new Set<string>(["revenue", "net_income"]);

export const NUMERIC_NATION_FIELDS = NATION_FIELDS.filter(
  (f) => f.format !== "text" && !FORMULA_LOCKED_FIELDS.has(f.key as string),
).map((f) => f.key as string);

export const COMMODITY_FIELDS = ["base_price", "current_price", "previous_price"];

const BLANK = "—";

const NUMBER_DISPLAY_STORAGE_KEY = "sohbos:number-display-mode";

/** Site-wide preference: "compact" shows 5T / 5B / 5M, "full" spells out 5,000,000,000,000.
 * Read directly by fmtCompact so every caller across the app — tables, panels, the Workbench —
 * respects the same toggle without needing to thread a prop through each one. */
let numberDisplayMode: "compact" | "full" = "compact";

export function getNumberDisplayMode(): "compact" | "full" {
  return numberDisplayMode;
}

export function setNumberDisplayMode(mode: "compact" | "full") {
  numberDisplayMode = mode;
  try {
    window.localStorage.setItem(NUMBER_DISPLAY_STORAGE_KEY, mode);
  } catch {
    // storage unavailable — the toggle still works for this session
  }
}

/** Call once, client-side only, to restore the player's last choice before anything renders
 * with real numbers. Safe to call multiple times. */
export function loadNumberDisplayMode() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(NUMBER_DISPLAY_STORAGE_KEY);
    if (raw === "compact" || raw === "full") numberDisplayMode = raw;
  } catch {
    // fall through to the default
  }
}

export function fmtCompact(value: number | null | undefined, currency = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return BLANK;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (numberDisplayMode === "full") {
    return `${sign}${currency}${Math.ceil(abs).toLocaleString("en-US")}`;
  }
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [scale, suffix] of units) {
    if (abs >= scale) return `${sign}${currency}${(abs / scale).toFixed(2)}${suffix}`;
  }
  return `${sign}${currency}${Math.ceil(abs)}`;
}

export function fmtFull(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return BLANK;
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return BLANK;
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtValue(value: unknown, format: FieldFormat, currency = "C$"): string {
  if (value === null || value === undefined || value === "") return BLANK;
  if (format === "text") return String(value);
  const n = Number(value);
  if (Number.isNaN(n)) return BLANK;
  if (format === "pct") return fmtPct(n);
  if (format === "money") return fmtCompact(n, currency);
  if (format === "ratio") return n.toFixed(4);
  if (format === "population") return fmtFull(Math.ceil(n));
  return fmtFull(n);
}

export function fmtPrice(value: number | null | undefined, currency = "C$"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return BLANK;
  const digits = Math.abs(value) >= 100 ? 2 : 4;
  return `${currency}${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !previous) return null;
  return (current - previous) / Math.abs(previous);
}

export function applyOp(current: number | null, op: RulingEffect["op"], value: number): number {
  const base = current ?? 0;
  switch (op) {
    case "set":
      return value;
    case "add":
      return base + value;
    case "mult":
      return base * value;
    case "pct":
      return base * (1 + value / 100);
    default:
      return base;
  }
}

export const OP_LABELS: Record<RulingEffect["op"], string> = {
  set: "Set to",
  add: "Add",
  mult: "Multiply by",
  pct: "Change by %",
};

/** Fields whose sign carries a positive/negative economic meaning. */
export const SIGNED_FIELDS = new Set<string>([
  "growth_rate",
  "pop_growth",
  "migration",
  "net_income",
  "revenue",
  "treasury",
]);

/** Fields where a rising number is bad news (inflation, debt). */
export const INVERSE_FIELDS = new Set<string>(["inflation_rate", "debt", "expenditures"]);

/** Semantic colour class for a figure, or "" when the figure is neutral. */
export function valueTone(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  if (SIGNED_FIELDS.has(key)) return n > 0 ? "text-gain" : "text-loss";
  if (INVERSE_FIELDS.has(key)) return n > 0 ? "text-loss" : "text-gain";
  return "";
}

/** Colour class for an arbitrary signed amount (surplus vs deficit). */
export function amountTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0)
    return "text-neutral";
  return value > 0 ? "text-gain" : "text-loss";
}

/**
 * Inflation is not inherently bad: mild inflation or deflation reads green,
 * inflation above growth reads red, and inflation at or above growth but still
 * modest reads amber. Deflation only turns amber past 3%.
 */
export function inflationTone(
  inflation: number | string | null | undefined,
  growth: number | string | null | undefined,
): string {
  const i = Number(inflation);
  if (inflation === null || inflation === undefined || inflation === "" || !Number.isFinite(i))
    return "";
  const gRaw = Number(growth);
  const hasGrowth =
    growth !== null && growth !== undefined && growth !== "" && Number.isFinite(gRaw);
  if (i < 0) return Math.abs(i) > 0.03 ? "text-warn" : "text-gain";
  // Without a real, filed growth figure there's nothing to compare inflation against — treat
  // it on its own terms rather than silently comparing it to a growth rate of 0, which would
  // wrongly flag ordinary positive inflation as "worse than growth" for any nation that simply
  // hasn't filed a growth rate yet.
  if (!hasGrowth) return i <= 0.02 ? "text-gain" : "text-warn";
  if (i > gRaw) return "text-loss";
  if (i <= 0.02) return "text-gain";
  return "text-warn";
}

/** The growth-rate figure itself reads amber once inflation has overtaken it — growth "on
 * paper" that inflation is quietly eating into — otherwise it uses the ordinary signed tone. */
export function growthTone(
  growth: number | string | null | undefined,
  inflation: number | string | null | undefined,
): string {
  const g = Number(growth);
  if (growth === null || growth === undefined || growth === "" || !Number.isFinite(g)) return "";
  const iRaw = Number(inflation);
  const hasInflation =
    inflation !== null && inflation !== undefined && inflation !== "" && Number.isFinite(iRaw);
  if (hasInflation && iRaw > g) return "text-warn";
  if (g === 0) return "";
  return g > 0 ? "text-gain" : "text-loss";
}
