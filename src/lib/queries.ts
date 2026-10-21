import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { derivedGdp, type GameState, type Nation, type Ruling } from "./econ";
import type { TaxFormula } from "./formula";
import type { CreditTier, DebtInstrument } from "./debt";

export const gameStateQuery = queryOptions({
  queryKey: ["game_state"],
  queryFn: async (): Promise<GameState> => {
    const { data, error } = await supabase.from("game_state").select("*").eq("id", 1).single();
    if (error) throw error;
    return data as GameState;
  },
});

export const nationsQuery = queryOptions({
  queryKey: ["nations"],
  queryFn: async (): Promise<Nation[]> => {
    const { data, error } = await supabase
      .from("nations")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    // Derived figures are never stored by hand: GDP per capita = nominal ÷ population, real GDP
    // = nominal ÷ (1 + inflation ratio), PPP GDP = nominal × PPP conversion rate. Always live.
    return ((data ?? []) as Nation[]).map((n) => {
      const d = derivedGdp(n);
      const out: Nation = { ...n };
      if (d.gdp_real !== null) out.gdp_real = d.gdp_real;
      if (d.gdp_ppp !== null) out.gdp_ppp = d.gdp_ppp;
      if (
        typeof n.gdp_nominal === "number" &&
        typeof n.population === "number" &&
        n.population > 0
      ) {
        out.gdp_per_capita = n.gdp_nominal / n.population;
      }
      if (typeof n.debt === "number" && typeof n.gdp_nominal === "number" && n.gdp_nominal > 0) {
        out.debt_gdp_ratio = n.debt / n.gdp_nominal;
      }
      if (typeof n.revenue === "number" && typeof n.gdp_nominal === "number" && n.gdp_nominal > 0) {
        out.revenue_gdp_ratio = n.revenue / n.gdp_nominal;
      }
      return out;
    });
  },
});

export const rulingsQuery = queryOptions({
  queryKey: ["rulings"],
  queryFn: async (): Promise<Ruling[]> => {
    const { data, error } = await supabase
      .from("rulings")
      .select("*")
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Ruling[];
  },
});

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  anchor_acronym: string | null;
  sort_order: number;
};

export const currenciesQuery = queryOptions({
  queryKey: ["currencies"],
  queryFn: async (): Promise<Currency[]> => {
    const { data, error } = await supabase
      .from("currencies")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Currency[];
  },
});

export const formulaQuery = queryOptions({
  queryKey: ["formula_settings"],
  queryFn: async (): Promise<Record<string, number>> => {
    const { data, error } = await supabase
      .from("formula_settings")
      .select("params")
      .eq("id", 1)
      .single();
    if (error) throw error;
    return (data.params ?? {}) as Record<string, number>;
  },
});

export const taxFormulasQuery = queryOptions({
  queryKey: ["tax_formulas"],
  queryFn: async (): Promise<TaxFormula[]> => {
    const { data, error } = await supabase
      .from("tax_formulas")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as TaxFormula[];
  },
});

export const debtInstrumentsQuery = queryOptions({
  queryKey: ["debt_instruments"],
  queryFn: async (): Promise<DebtInstrument[]> => {
    const { data, error } = await supabase
      .from("debt_instruments" as never)
      .select("*")
      .order("sort_order" as never, { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as DebtInstrument[];
  },
});

export const creditTiersQuery = queryOptions({
  queryKey: ["credit_tiers"],
  queryFn: async (): Promise<CreditTier[]> => {
    const { data, error } = await supabase
      .from("credit_tiers" as never)
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as CreditTier[];
  },
});

export type Snapshot = {
  id: string;
  year: number;
  kind: string;
  ref_id: string;
  data: Record<string, unknown>;
};

export const snapshotYearsQuery = queryOptions({
  queryKey: ["snapshot_years"],
  queryFn: async (): Promise<number[]> => {
    const { data, error } = await supabase
      .from("year_snapshots")
      .select("year")
      .order("year", { ascending: false });
    if (error) throw error;
    return Array.from(new Set((data ?? []).map((r) => r.year)));
  },
});

export const snapshotsForYearQuery = (year: number) =>
  queryOptions({
    queryKey: ["year_snapshots", year],
    queryFn: async (): Promise<Snapshot[]> => {
      const { data, error } = await supabase.from("year_snapshots").select("*").eq("year", year);
      if (error) throw error;
      return (data ?? []) as unknown as Snapshot[];
    },
  });

/** A custom variable a preset's brackets read: carried inside the preset, and created on any state
 * that imports it without already having a variable of that key. `value` is the default it starts at. */
export type PresetVariable = { key: string; label: string; value: number };

export type FormulaPreset = {
  id: string;
  name: string;
  brackets: { name: string; tokens: import("./formula").FormulaToken[] }[];
  /** Absent on presets saved before variables travelled with them. */
  variables?: PresetVariable[];
};

/** Saved tax presets. Returns an empty list if the table hasn't been created yet. */
export const formulaPresetsQuery = queryOptions({
  queryKey: ["formula_presets"],
  queryFn: async (): Promise<FormulaPreset[]> => {
    const { data, error } = await supabase
      .from("formula_presets" as never)
      .select("*")
      .order("name" as never, { ascending: true });
    if (error) return [];
    return (data ?? []) as unknown as FormulaPreset[];
  },
});

/** The slice of each filed year's nation snapshot that the history charts need. Pulled with JSON
 * paths so the (potentially large) flag image inside every snapshot is never downloaded. */
export type NationSnapshotRow = {
  year: number;
  ref_id: string;
  gdp_nominal: number | null;
  gdp_real: number | null;
  gdp_ppp: number | null;
  ppp_conversion: number | null;
  inflation_ratio: number | null;
  inflation_rate: number | null;
  growth_rate: number | null;
  population: number | null;
  migration: number | null;
};

const HISTORY_FIELDS = [
  "gdp_nominal",
  "gdp_real",
  "gdp_ppp",
  "ppp_conversion",
  "inflation_ratio",
  "inflation_rate",
  "growth_rate",
  "population",
  "migration",
];
const HISTORY_SELECT = ["year", "ref_id", ...HISTORY_FIELDS.map((f) => `${f}:data->${f}`)].join(
  ",",
);

/** Every filed year for the given nations (a state plus its subdivisions). Invalidate the
 * "nation_history" key whenever the archive changes. */
export const nationHistoryQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["nation_history", ...ids],
    queryFn: async (): Promise<NationSnapshotRow[]> => {
      const { data, error } = await supabase
        .from("year_snapshots")
        .select(HISTORY_SELECT as "*")
        .eq("kind", "nation")
        .in("ref_id", ids)
        .order("year", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as NationSnapshotRow[];
    },
  });
