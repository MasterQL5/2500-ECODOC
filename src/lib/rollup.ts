import type { Nation } from "./econ";

/**
 * How a parent tag combines with its subdivisions, chosen per statistic group:
 *  - "sum":       the parent shows the sum of its subdivisions; its own row is ignored.
 *                 (Tianxia, SSF, Adramis, and the EU's GDP/population.)
 *  - "core_plus": the parent is itself a real nation (the core); subdivisions are added on top.
 *                 (Tataria, Angola.)
 *  - "own":       the parent's own figure only; subdivisions are not added in.
 *                 (The EU's own treasury/budget, kept separate from its members' budgets.)
 *
 * Stored in nation.fiscal.__rollup so no database migration is needed. A parent with nothing
 * stored defaults to "core_plus" in every group.
 */
export type RollupMode = "sum" | "core_plus" | "own";
export type RollupDomain = "economy" | "population" | "finance";
export type RollupSettings = Record<RollupDomain, RollupMode>;

export const ROLLUP_DOMAINS: { key: RollupDomain; label: string; fields: string[] }[] = [
  { key: "economy", label: "Economy (GDP)", fields: ["gdp_nominal", "gdp_real", "gdp_ppp"] },
  { key: "population", label: "Population", fields: ["population", "migration"] },
  {
    key: "finance",
    label: "Government finances",
    fields: ["revenue", "expenditures", "net_income", "treasury", "debt"],
  },
];

export const FIELD_DOMAIN: Record<string, RollupDomain> = Object.fromEntries(
  ROLLUP_DOMAINS.flatMap((d) => d.fields.map((f) => [f, d.key] as const)),
);

export const ROLLUP_MODES: RollupMode[] = ["sum", "core_plus", "own"];

export const MODE_META: Record<
  RollupMode,
  { glyph: string; label: string; short: string; className: string }
> = {
  sum: {
    glyph: "Σ",
    label: "Sum of subdivisions",
    short: "Sum of subdivisions",
    className: "text-sky-400",
  },
  core_plus: {
    glyph: "+",
    label: "Own figure + subdivisions on top",
    short: "Own + subdivisions",
    className: "text-emerald-400",
  },
  own: {
    glyph: "◦",
    label: "Own figure only",
    short: "Own figure only",
    className: "text-amber-400",
  },
};

export const DEFAULT_ROLLUP: RollupSettings = {
  economy: "core_plus",
  population: "core_plus",
  finance: "core_plus",
};

function isMode(v: unknown): v is RollupMode {
  return v === "sum" || v === "core_plus" || v === "own";
}

export function rollupSettings(nation: Pick<Nation, "fiscal">): RollupSettings {
  const raw = (nation.fiscal as Record<string, unknown> | null)?.["__rollup"];
  const out = { ...DEFAULT_ROLLUP };
  if (raw && typeof raw === "object") {
    for (const d of ROLLUP_DOMAINS) {
      const v = (raw as Record<string, unknown>)[d.key];
      if (isMode(v)) out[d.key] = v;
    }
  }
  return out;
}

/** The fiscal jsonb to save so that one domain's mode changes and everything else is kept. */
export function fiscalWithRollup(
  nation: Pick<Nation, "fiscal">,
  domain: RollupDomain,
  mode: RollupMode,
): Record<string, unknown> {
  const current = (nation.fiscal ?? {}) as Record<string, unknown>;
  return { ...current, __rollup: { ...rollupSettings(nation), [domain]: mode } };
}

export function childrenOf(nation: Pick<Nation, "acronym">, all: Nation[]): Nation[] {
  return all.filter((n) => n.parent_acronym === nation.acronym);
}

export type RolledValue = {
  value: number | null;
  /** null when the nation has no subdivisions, or the field is not a rolled-up statistic. */
  mode: RollupMode | null;
};

export function rolledValue(nation: Nation, all: Nation[], key: keyof Nation): RolledValue {
  const own = typeof nation[key] === "number" ? (nation[key] as number) : null;
  const domain = FIELD_DOMAIN[key as string];
  if (!domain) return { value: own, mode: null };
  const kids = childrenOf(nation, all);
  if (kids.length === 0) return { value: own, mode: null };
  const mode = rollupSettings(nation)[domain];
  if (mode === "own") return { value: own, mode };
  const kidValues = kids.map((k) => k[key]).filter((v): v is number => typeof v === "number");
  const kidSum = kidValues.reduce((s, v) => s + v, 0);
  if (mode === "sum") return { value: kidValues.length > 0 ? kidSum : null, mode };
  // core_plus
  if (own === null && kidValues.length === 0) return { value: null, mode };
  return { value: (own ?? 0) + kidSum, mode };
}

/** Drop-in total for any additive figure: honours the parent's per-statistic setting. */
export function rolledTotal(nation: Nation, all: Nation[], key: keyof Nation): number | null {
  return rolledValue(nation, all, key).value;
}

/**
 * The GDP the parent's own taxes are charged on. When economy is "sum" (the EU case) a parent's
 * own row holds no GDP, so its taxes run on the members' combined GDP; otherwise on its own.
 */
export function taxBaseGdp(nation: Nation, all: Nation[]): number | null {
  const kids = childrenOf(nation, all);
  if (kids.length > 0 && rollupSettings(nation).economy === "sum") {
    return rolledValue(nation, all, "gdp_nominal").value;
  }
  return nation.gdp_nominal;
}

/** The nation as a tax formula should see it: GDP replaced by the tax base. */
export function withTaxBase(nation: Nation, all: Nation[]): Nation {
  const base = taxBaseGdp(nation, all);
  return base === nation.gdp_nominal ? nation : { ...nation, gdp_nominal: base };
}

// ---------------------------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------------------------

export type RollupIssue = {
  id: string;
  parent: string;
  domain: RollupDomain;
  severity: "warn" | "info";
  message: string;
  /** One-click fix: switch this domain to this mode. Null when it needs a manual data change. */
  fix: { mode: RollupMode; label: string } | null;
};

const REP_FIELDS: Record<RollupDomain, string[]> = {
  economy: ["gdp_nominal"],
  population: ["population"],
  finance: ["treasury", "debt", "revenue"],
};

const near = (a: number, b: number) =>
  a !== 0 && b !== 0 && Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b));

export function checkRollups(all: Nation[]): RollupIssue[] {
  const issues: RollupIssue[] = [];
  const parents = all.filter((n) => !n.parent_acronym && childrenOf(n, all).length > 0);
  for (const p of parents) {
    const kids = childrenOf(p, all);
    const settings = rollupSettings(p);
    for (const d of ROLLUP_DOMAINS) {
      const mode = settings[d.key];
      for (const f of REP_FIELDS[d.key]) {
        const own = typeof p[f as keyof Nation] === "number" ? (p[f as keyof Nation] as number) : 0;
        const kidVals = kids
          .map((k) => ({ k, v: k[f as keyof Nation] }))
          .filter((x): x is { k: Nation; v: number } => typeof x.v === "number" && x.v !== 0);
        const kidSum = kidVals.reduce((s, x) => s + x.v, 0);

        if (mode === "sum" && own !== 0 && !near(own, kidSum)) {
          issues.push({
            id: `${p.acronym}:${d.key}:${f}:ignored_own`,
            parent: p.acronym,
            domain: d.key,
            severity: "warn",
            message: `${p.acronym} holds its own ${f.replace(/_/g, " ")} that is not counted (sum mode ignores the parent row). Move it into a subdivision, or count it on top.`,
            fix: { mode: "core_plus", label: "Count it on top (+)" },
          });
        }
        if (mode === "core_plus") {
          const dup = kidVals.find((x) => near(x.v, own));
          if (dup) {
            issues.push({
              id: `${p.acronym}:${d.key}:${f}:double`,
              parent: p.acronym,
              domain: d.key,
              severity: "warn",
              message: `${dup.k.acronym} has almost the same ${f.replace(/_/g, " ")} as ${p.acronym} itself, so it is probably counted twice.`,
              fix: { mode: "sum", label: "Use subdivisions only (Σ)" },
            });
          }
        }
        if (mode === "own" && d.key !== "finance" && kidVals.length > 0) {
          issues.push({
            id: `${p.acronym}:${d.key}:${f}:ignored_kids`,
            parent: p.acronym,
            domain: d.key,
            severity: "info",
            message: `${p.acronym}'s ${d.label.toLowerCase()} ignores subdivision figures (own only).`,
            fix: { mode: "core_plus", label: "Add subdivisions (+)" },
          });
        }
        if (mode === "own" && d.key === "finance" && kidVals.length > 1 && near(own, kidSum)) {
          issues.push({
            id: `${p.acronym}:${d.key}:${f}:copy`,
            parent: p.acronym,
            domain: d.key,
            severity: "warn",
            message: `${p.acronym}'s own ${f.replace(/_/g, " ")} equals its members' combined total. It may be a stale copy; set the real figure by hand.`,
            fix: null,
          });
        }
      }
    }
  }
  // collapse repeats of the same (parent, domain, kind) into one row
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.parent}:${i.domain}:${i.id.split(":").pop()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
