import { derivedGdp, type Nation } from "./econ";
import type { NationSnapshotRow } from "./queries";
import { rolledValue } from "./rollup";

export type HistoryPoint = {
  year: number;
  gdp_nominal: number | null;
  gdp_real: number | null;
  gdp_ppp: number | null;
  inflation_rate: number | null;
  population: number | null;
  /** The open year, drawn from the live figures rather than a filed snapshot. */
  live: boolean;
};

const KEYS = ["gdp_nominal", "gdp_real", "gdp_ppp", "inflation_rate", "population"] as const;

function pointFor(parent: Nation, members: Nation[], year: number, live: boolean): HistoryPoint {
  const point: HistoryPoint = {
    year,
    gdp_nominal: null,
    gdp_real: null,
    gdp_ppp: null,
    inflation_rate: null,
    population: null,
    live,
  };
  for (const k of KEYS) point[k] = rolledValue(parent, members, k).value;
  return point;
}

/**
 * Year-on-year figures for one state: every filed year from the archive, then the open year from
 * the live sheet, so the last point of every chart moves the moment anything is amended.
 *
 * A state with subdivisions is rolled up exactly as the register rolls it up (sum / own + members
 * / own only), year by year. The roll-up settings and the subdivision structure come from today's
 * sheet; only the figures come from the archive.
 */
export function buildNationHistory(
  nation: Nation,
  nations: Nation[],
  snapshots: NationSnapshotRow[],
  currentYear: number,
): HistoryPoint[] {
  const members = nations.filter((n) => n.id === nation.id || n.parent_acronym === nation.acronym);
  const byId = new Map(members.map((m) => [m.id, m]));
  const years = new Map<number, Nation[]>();

  for (const s of snapshots) {
    const base = byId.get(s.ref_id);
    if (!base) continue;
    const derived = derivedGdp({
      gdp_nominal: s.gdp_nominal,
      inflation_ratio: s.inflation_ratio,
      ppp_conversion: s.ppp_conversion,
    });
    const filed: Nation = {
      ...base,
      gdp_nominal: s.gdp_nominal,
      gdp_real: derived.gdp_real ?? s.gdp_real,
      gdp_ppp: derived.gdp_ppp ?? s.gdp_ppp,
      ppp_conversion: s.ppp_conversion,
      inflation_ratio: s.inflation_ratio,
      inflation_rate: s.inflation_rate,
      growth_rate: s.growth_rate,
      population: s.population,
      migration: s.migration,
    };
    const list = years.get(s.year) ?? [];
    list.push(filed);
    years.set(s.year, list);
  }

  const points: HistoryPoint[] = [];
  for (const [year, list] of years) {
    if (year === currentYear) continue; // the live sheet speaks for the open year
    const parent = list.find((n) => n.id === nation.id);
    if (!parent) continue;
    points.push(pointFor(parent, list, year, false));
  }
  points.sort((a, b) => a.year - b.year);
  points.push(pointFor(nation, nations, currentYear, true));
  return points;
}
