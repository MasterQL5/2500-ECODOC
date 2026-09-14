import type { Nation } from "./econ";
import { NATION_FIELDS } from "./econ";
import { fiscalOf, type FiscalParams } from "./fiscal";

export type FormulaToken =
  | { t: "num"; v: number; d?: string }
  | { t: "stat"; k: string; d?: string }
  | { t: "fiscal"; k: string; d?: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")"; d?: string };

export type TaxFormula = {
  id: string;
  nation_id: string;
  name: string;
  tokens: FormulaToken[];
  sort_order: number;
  source: string;
  group_name: string | null;
};

/** The tax name a formula row belongs to (its bracket group). */
export function groupOf(t: TaxFormula): string {
  return t.group_name?.trim() || t.name;
}

export const OPERATORS: FormulaToken extends never
  ? never
  : Array<"+" | "-" | "*" | "/" | "(" | ")"> = ["+", "-", "*", "/", "(", ")"];

export const OP_SYMBOLS: Record<string, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "(": "(",
  ")": ")",
};

export const STAT_KEYS = NATION_FIELDS.filter((f) => f.format !== "text").map(
  (f) => f.key as string,
);

export const STAT_LABELS: Record<string, string> = Object.fromEntries(
  NATION_FIELDS.map((f) => [f.key as string, f.label]),
);

export const FISCAL_LABELS: Record<string, string> = {
  labor_share_gdp: "Labour share of GDP",
  labor_participation: "Labour participation",
  income_tax_rate: "Income tax rate",
  manufacturing_multiplier: "Manufacturing multiplier",
  corporate_share_go: "Corporate share of gross output",
  mean_profit_margin: "Mean profit margin",
  corporate_tax_rate: "Corporate tax rate",
  urban_acres: "Urban acres",
  urban_value: "Urban land value / acre",
  urban_lvt_rate: "Urban LVT rate",
  suburban_acres: "Suburban acres",
  suburban_value: "Suburban land value / acre",
  suburban_lvt_rate: "Suburban LVT rate",
  rural_acres: "Rural acres",
  rural_value: "Rural land value / acre",
  rural_lvt_rate: "Rural LVT rate",
  excise_revenue: "Excise & other revenue",
};

/** The six standard revenue-line formulas every new nation is seeded with, mirroring the
 * Bureau's original registration seed. */
export function standardTaxFormulaSeed(nationId: string): {
  nation_id: string;
  name: string;
  group_name: string;
  tokens: FormulaToken[];
  sort_order: number;
  source: string;
}[] {
  const rows: { name: string; ord: number; tokens: FormulaToken[] }[] = [
    {
      name: "Income tax",
      ord: 10,
      tokens: [
        { t: "stat", k: "gdp_nominal" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "labor_share_gdp" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "labor_participation" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "income_tax_rate" },
      ],
    },
    {
      name: "Corporate tax",
      ord: 20,
      tokens: [
        { t: "stat", k: "gdp_nominal" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "manufacturing_multiplier" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "corporate_share_go" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "mean_profit_margin" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "corporate_tax_rate" },
      ],
    },
    {
      name: "Urban land value tax",
      ord: 30,
      tokens: [
        { t: "fiscal", k: "urban_acres" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "urban_value" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "urban_lvt_rate" },
      ],
    },
    {
      name: "Suburban land value tax",
      ord: 40,
      tokens: [
        { t: "fiscal", k: "suburban_acres" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "suburban_value" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "suburban_lvt_rate" },
      ],
    },
    {
      name: "Rural land value tax",
      ord: 50,
      tokens: [
        { t: "fiscal", k: "rural_acres" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "rural_value" },
        { t: "op", v: "*" },
        { t: "fiscal", k: "rural_lvt_rate" },
      ],
    },
    {
      name: "Excise & other",
      ord: 60,
      tokens: [{ t: "fiscal", k: "excise_revenue" }],
    },
  ];
  return rows.map((r) => ({
    nation_id: nationId,
    name: r.name,
    group_name: r.name,
    tokens: r.tokens,
    sort_order: r.ord,
    source: "bureau",
  }));
}

export type FormulaContext = {
  nation: Nation;
  params: FiscalParams;
  /** Labels for this nation's custom variables, merged over the Bureau defaults. */
  labels: Record<string, string>;
};

export type CustomVarMeta = { key: string; label: string; visibleToPlayer?: boolean };

const CUSTOM_VARS_KEY = "__custom_vars";
const VISIBLE_FIELDS_KEY = "__visible_fields";

/** Which fiscal fields — custom variables or built-in Bureau fields alike — a GM has marked
 * visible and editable by the nation itself in its own panel. Independent of customVarsOf: a
 * GM can expose a variable a formula already references (like the standard income_tax_rate)
 * without needing to first recreate it as a duplicate custom variable. */
export function visibleFieldsOf(nation: Pick<Nation, "fiscal">): Set<string> {
  const raw = (nation.fiscal ?? {})[VISIBLE_FIELDS_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((v): v is string => typeof v === "string"));
}

/** The GM-defined custom variables filed against a nation (key + display label). */
export function customVarsOf(nation: Pick<Nation, "fiscal">): CustomVarMeta[] {
  const raw = (nation.fiscal ?? {})[CUSTOM_VARS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (v): v is CustomVarMeta =>
        typeof v === "object" && v !== null && typeof (v as CustomVarMeta).key === "string",
    )
    .map((v) => ({
      key: v.key,
      label: v.label || v.key.replace(/_/g, " "),
      visibleToPlayer: v.visibleToPlayer === true,
    }));
}

/** Merge a nation's custom variable labels over the Bureau-standard set. */
export function labelsFor(nation: Pick<Nation, "fiscal">): Record<string, string> {
  const merged = { ...FISCAL_LABELS };
  for (const v of customVarsOf(nation)) merged[v.key] = v.label;
  return merged;
}

/** Turn a free-text label into a safe, unique fiscal-variable key for this nation. */
export function slugForVariable(label: string, existing: string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "variable";
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function resolveToken(tok: FormulaToken, ctx: FormulaContext): number | string | null {
  if (tok.t === "num") return tok.v;
  if (tok.t === "op") return tok.v;
  if (tok.t === "stat") {
    const v = ctx.nation[tok.k as keyof Nation];
    return typeof v === "number" ? v : 0;
  }
  const v = (ctx.params as unknown as Record<string, unknown>)[tok.k];
  return typeof v === "number" ? v : 0;
}

/** Evaluate a left-to-right token sequence with standard operator precedence and parentheses. */
export function evalTokens(tokens: FormulaToken[], ctx: FormulaContext): number {
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

  const apply = () => {
    const op = ops.pop()!;
    const b = out.pop();
    const a = out.pop();
    if (typeof a !== "number" || typeof b !== "number") {
      out.push(0);
      return;
    }
    let r = 0;
    if (op === "+") r = a + b;
    else if (op === "-") r = a - b;
    else if (op === "*") r = a * b;
    else if (op === "/") r = b === 0 ? 0 : a / b;
    out.push(r);
  };

  let expectOperand = true;
  for (const tok of tokens) {
    const r = resolveToken(tok, ctx);
    if (typeof r === "number") {
      out.push(r);
      expectOperand = false;
      continue;
    }
    const op = String(r);
    if (op === "(") {
      ops.push(op);
      expectOperand = true;
    } else if (op === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") apply();
      if (ops[ops.length - 1] === "(") ops.pop();
      expectOperand = false;
    } else {
      if (expectOperand && op !== "-") continue; // skip leading binary operator
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        prec[ops[ops.length - 1]!]! >= prec[op]!
      ) {
        apply();
      }
      ops.push(op);
      expectOperand = true;
    }
  }
  while (ops.length) {
    if (ops[ops.length - 1] === "(") {
      ops.pop();
      continue;
    }
    apply();
  }
  const result = out[out.length - 1];
  return typeof result === "number" && Number.isFinite(result) ? result : 0;
}

/** Human-readable rendering of a token sequence, e.g. "GDP — nominal × 0.59 × Income tax rate". */
export function describeTokens(tokens: FormulaToken[], ctx: FormulaContext): string {
  return tokens
    .map((tok) => {
      if (tok.t === "num") return String(tok.v);
      if (tok.t === "op") return OP_SYMBOLS[tok.v] ?? tok.v;
      if (tok.t === "stat") return STAT_LABELS[tok.k] ?? tok.k;
      const label = ctx.labels[tok.k] ?? tok.k.replace(/_/g, " ");
      const v = (ctx.params as unknown as Record<string, unknown>)[tok.k];
      return `${label} (${typeof v === "number" ? v : 0})`;
    })
    .join(" ");
}

export function buildContext(nation: Nation, formula: Record<string, number>): FormulaContext {
  return { nation, params: fiscalOf(nation, formula), labels: labelsFor(nation) };
}

export function totalFormulaRevenue(taxes: TaxFormula[], ctx: FormulaContext): number {
  return taxes.reduce((sum, t) => sum + evalTokens(t.tokens, ctx), 0);
}

export type VariableRow = { key: string; label: string; value: number; kind: "stat" | "fiscal" };

/** The Bureau-set variables a single tax formula actually references, with their current values. */
export function tokenVariables(tokens: FormulaToken[], ctx: FormulaContext): VariableRow[] {
  const seen = new Map<string, VariableRow>();
  for (const tok of tokens) {
    if (tok.t === "stat") {
      const raw = ctx.nation[tok.k as keyof Nation];
      seen.set(`s:${tok.k}`, {
        key: tok.k,
        label: STAT_LABELS[tok.k] ?? tok.k.replace(/_/g, " "),
        value: typeof raw === "number" ? raw : 0,
        kind: "stat",
      });
    } else if (tok.t === "fiscal") {
      const raw = (ctx.params as unknown as Record<string, unknown>)[tok.k];
      seen.set(`f:${tok.k}`, {
        key: tok.k,
        label: ctx.labels[tok.k] ?? tok.k.replace(/_/g, " "),
        value: typeof raw === "number" ? raw : 0,
        kind: "fiscal",
      });
    }
  }
  return [...seen.values()];
}
