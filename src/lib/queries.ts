import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Commodity, GameState, Nation, Ruling } from "./econ";
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
    return (data ?? []) as Nation[];
  },
});

export const commoditiesQuery = queryOptions({
  queryKey: ["commodities"],
  queryFn: async (): Promise<Commodity[]> => {
    const { data, error } = await supabase
      .from("commodities")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Commodity[];
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
    const { data, error } = await supabase.from("debt_instruments" as never).select("*");
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
