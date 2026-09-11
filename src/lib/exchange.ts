import type { Nation } from "./econ";
import type { Currency } from "./queries";

export type ExchangeRow = {
  code: string;
  name: string;
  symbol: string;
  anchor: Nation | null;
  /** Cumulative inflation since the base year (0 = no inflation). */
  inflationRatio: number;
  /** Price level relative to the base year (1 + ratio). */
  priceLevel: number;
  /** How many base credits (C$) one unit of this currency buys. */
  perUnitInBase: number;
  /** How many units of this currency one base credit (C$) buys. */
  perBaseCredit: number;
  /** Latest annual inflation of the anchor economy. */
  inflationRate: number | null;
  members: Nation[];
};

export const BASE_CODE = "C$";

export function buildExchangeTable(
  currencies: Currency[],
  nations: Nation[],
): ExchangeRow[] {
  const byAcronym = new Map(nations.map((n) => [n.acronym, n]));

  const rows = currencies
    .filter((c) => c.code !== BASE_CODE)
    .map((c) => {
      const anchor = (c.anchor_acronym ? byAcronym.get(c.anchor_acronym) : null) ?? null;
      const members = nations.filter((n) => n.currency_group === c.code);
      // Prefer the anchor's ratio; otherwise average the bloc's filed figures.
      const filed = members.filter((n) => n.inflation_ratio !== null);
      const ratio =
        anchor?.inflation_ratio ??
        (filed.length
          ? filed.reduce((s, n) => s + (n.inflation_ratio ?? 0), 0) / filed.length
          : 0);
      const priceLevel = Math.max(0.0001, 1 + ratio);
      return {
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        anchor,
        inflationRatio: ratio,
        priceLevel,
        perUnitInBase: 1 / priceLevel,
        perBaseCredit: priceLevel,
        inflationRate: anchor?.inflation_rate ?? null,
        members,
      } satisfies ExchangeRow;
    });

  return rows.sort((a, b) => b.perUnitInBase - a.perUnitInBase);
}

/** Convert an amount between two currencies using their price levels. */
export function convert(amount: number, from: ExchangeRow | null, to: ExchangeRow | null): number {
  const fromLevel = from?.priceLevel ?? 1;
  const toLevel = to?.priceLevel ?? 1;
  return (amount / fromLevel) * toLevel;
}
