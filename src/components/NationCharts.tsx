import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GameState, Nation } from "@/lib/econ";
import { fmtCompact, fmtFull, fmtPct } from "@/lib/econ";
import { buildNationHistory, type HistoryPoint } from "@/lib/history";
import { nationHistoryQuery } from "@/lib/queries";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";

type SeriesDef = {
  key: keyof HistoryPoint;
  label: string;
  color: string;
};

/** Axis labels stay short whatever the sheet's short/full number toggle says. */
function axisCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  for (const [scale, suffix] of [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    if (abs >= scale)
      return `${sign}${+(abs / scale).toFixed(abs / scale >= 100 ? 0 : 1)}${suffix}`;
  }
  return `${sign}${+abs.toFixed(0)}`;
}

function axisPct(v: number): string {
  return `${+(v * 100).toFixed(1)}%`;
}

const TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

function ChartTip({
  active,
  payload,
  label,
  series,
  format,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | null; payload?: HistoryPoint }[];
  label?: string | number;
  series: SeriesDef[];
  format: (key: string, v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const live = payload[0]?.payload?.live;
  return (
    <div className="rounded border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="rule-label mb-1">
        Year {label}
        {live ? " · open year" : ""}
      </div>
      {series.map((s) => {
        const row = payload.find((p) => p.dataKey === s.key);
        if (!row) return null;
        return (
          <div key={s.key} className="tabular flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-foreground">
              {typeof row.value === "number" ? format(String(s.key), row.value) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HistoryLines({
  data,
  series,
  yFormat,
  tipFormat,
  height = 230,
}: {
  data: HistoryPoint[];
  series: SeriesDef[];
  yFormat: (v: number) => string;
  tipFormat: (key: string, v: number) => string;
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="year"
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            padding={{ left: 12, right: 12 }}
          />
          <YAxis
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={yFormat}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            content={<ChartTip series={series} format={tipFormat} />}
          />
          {series.map((s) => (
            <Line
              key={s.key as string}
              type="monotone"
              dataKey={s.key as string}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, stroke: "var(--card)", strokeWidth: 1 }}
              activeDot={{ r: 5, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  className = "",
  controls,
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded border border-border bg-card p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="rule-label">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        {controls}
      </div>
      {children}
    </section>
  );
}

const GDP_SERIES: SeriesDef[] = [
  { key: "gdp_nominal", label: "Nominal", color: "var(--chart-1)" },
  { key: "gdp_real", label: "Real", color: "var(--chart-2)" },
  { key: "gdp_ppp", label: "PPP", color: "var(--chart-3)" },
];

/**
 * Year-on-year charts for one state: inflation, GDP (nominal / real / PPP, each switchable on
 * the same chart) and population. Filed years come from the archive; the last point is the open
 * year read live from the sheet, so every chart follows an amendment as soon as it is made.
 */
export function NationCharts({
  nation,
  nations,
  state,
  currency,
}: {
  nation: Nation;
  nations: Nation[];
  state: GameState;
  currency: string;
}) {
  useNumberDisplay();
  const ids = useMemo(
    () =>
      nations
        .filter((n) => n.id === nation.id || n.parent_acronym === nation.acronym)
        .map((n) => n.id),
    [nations, nation.id, nation.acronym],
  );
  const { data: snapshots = [], isLoading } = useQuery(nationHistoryQuery(ids));
  const [shown, setShown] = useState<Set<string>>(
    () => new Set(["gdp_nominal", "gdp_real", "gdp_ppp"]),
  );

  const data = useMemo(
    () => buildNationHistory(nation, nations, snapshots, state.current_year),
    [nation, nations, snapshots, state.current_year],
  );
  const filedYears = data.filter((p) => !p.live).length;

  function toggle(key: string) {
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // always keep one line on the chart
        next.delete(key);
      } else next.add(key);
      return next;
    });
  }

  const gdpShown = GDP_SERIES.filter((s) => shown.has(s.key as string));
  const note =
    filedYears === 0
      ? isLoading
        ? "Loading the archive…"
        : "Only the open year is on file so far — the lines grow as each year is advanced."
      : `${filedYears} filed year${filedYears === 1 ? "" : "s"} plus the open year (${state.current_year}).`;

  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="Gross domestic product"
        subtitle={`Yearly, in ${currency}. Switch nominal, real and PPP on or off to compare them.`}
        className="lg:col-span-2"
        controls={
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="GDP series">
            {GDP_SERIES.map((s) => {
              const on = shown.has(s.key as string);
              return (
                <button
                  key={s.key as string}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.key as string)}
                  className={`rule-label flex items-center gap-1.5 rounded border px-2.5 py-1 ${
                    on
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{
                      background: on ? s.color : "transparent",
                      outline: `1px solid ${s.color}`,
                    }}
                  />
                  GDP {s.label}
                </button>
              );
            })}
          </div>
        }
      >
        <HistoryLines
          data={data}
          series={gdpShown}
          yFormat={(v) => `${currency}${axisCompact(v)}`}
          tipFormat={(_k, v) => fmtCompact(v, currency)}
          height={260}
        />
      </ChartCard>

      <ChartCard title="Inflation" subtitle="Yearly inflation rate.">
        <HistoryLines
          data={data}
          series={[{ key: "inflation_rate", label: "Inflation", color: "var(--chart-4)" }]}
          yFormat={axisPct}
          tipFormat={(_k, v) => fmtPct(v)}
        />
      </ChartCard>

      <ChartCard title="Population" subtitle="Total population at each year.">
        <HistoryLines
          data={data}
          series={[{ key: "population", label: "Population", color: "var(--chart-5)" }]}
          yFormat={axisCompact}
          tipFormat={(_k, v) => fmtFull(Math.ceil(v))}
        />
      </ChartCard>

      <p className="text-[11px] text-muted-foreground lg:col-span-2">{note}</p>
    </div>
  );
}
