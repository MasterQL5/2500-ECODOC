import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { CATEGORY_PALETTE } from "@/lib/chartColors";
import { NATION_FIELDS, fmtValue, nationTotal, type Nation } from "@/lib/econ";
import { buildNationHistory, type HistoryPoint } from "@/lib/history";
import { nationHistoryQuery } from "@/lib/queries";

const TICK = { fill: "var(--muted-foreground)", fontSize: 11 };
const HISTORY_KEYS = ["gdp_nominal", "gdp_real", "gdp_ppp", "inflation_rate", "population"];
const CHART_KEYS = [
  "gdp_real",
  "gdp_nominal",
  "gdp_ppp",
  "gdp_per_capita",
  "growth_rate",
  "inflation_rate",
  "population",
  "pop_growth",
  "revenue",
  "revenue_gdp_ratio",
  "expenditures",
  "net_income",
  "treasury",
  "debt",
  "debt_gdp_ratio",
];

function axisCompact(v: number, pct: boolean): string {
  if (pct) return `${+(v * 100).toFixed(1)}%`;
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
  return `${sign}${+abs.toFixed(abs < 10 ? 2 : 0)}`;
}

/**
 * Global economy charts for the Overview: any register statistic, either over the filed years or
 * as of now, for every sovereign state (each switchable) beside the global average.
 */
export function GlobalCharts({ nations, currency }: { nations: Nation[]; currency: string }) {
  useNumberDisplay();
  const sovereign = useMemo(
    () => nations.filter((n) => !n.parent_acronym && n.acronym !== "APE"),
    [nations],
  );
  const fields = CHART_KEYS.map((k) => NATION_FIELDS.find((f) => (f.key as string) === k)).filter(
    (f): f is NonNullable<typeof f> => !!f,
  );
  const [statKey, setStatKey] = useState("gdp_real");
  const [view, setView] = useState<"time" | "now">("now");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [showAvg, setShowAvg] = useState(true);

  const field = fields.find((f) => (f.key as string) === statKey) ?? fields[0]!;
  const isPct = field.format === "pct";
  const canHistory = HISTORY_KEYS.includes(statKey);
  const mode = canHistory ? view : "now";
  const colorOf = (i: number) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!;
  const active = sovereign.filter((n) => !off.has(n.id));

  const ids = useMemo(() => nations.map((n) => n.id), [nations]);
  const { data: snapshots = [], isLoading } = useQuery({
    ...nationHistoryQuery(ids),
    enabled: mode === "time",
  });

  const currentYear = useMemo(() => {
    const ys = snapshots.map((s) => s.year);
    return (ys.length ? Math.max(...ys) : 0) + 1;
  }, [snapshots]);

  const timeData = useMemo(() => {
    if (mode !== "time") return [];
    const perNation = sovereign.map((n) => ({
      n,
      pts: new Map(
        buildNationHistory(n, nations, snapshots, currentYear).map((p) => [p.year, p] as const),
      ),
    }));
    const years = [...new Set(perNation.flatMap((p) => [...p.pts.keys()]))].sort((a, b) => a - b);
    return years.map((year) => {
      const row: Record<string, number | null> = { year };
      const vals: number[] = [];
      for (const { n, pts } of perNation) {
        const v = (pts.get(year) as HistoryPoint | undefined)?.[statKey as keyof HistoryPoint];
        row[n.id] = typeof v === "number" ? v : null;
        if (typeof v === "number" && !off.has(n.id)) vals.push(v);
      }
      row["__avg"] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      return row;
    });
  }, [mode, sovereign, nations, snapshots, currentYear, statKey, off]);

  const nowData = useMemo(() => {
    const rows = active
      .map((n) => ({
        id: n.id,
        name: n.acronym,
        full: n.name,
        value: nationTotal(n, nations, statKey as keyof Nation),
        color: colorOf(sovereign.indexOf(n)),
      }))
      .filter((r): r is typeof r & { value: number } => typeof r.value === "number")
      .sort((a, b) => b.value - a.value);
    const avg = rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : null;
    return { rows, avg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.map((n) => n.id).join("|"), nations, statKey]);

  const fmt = (v: number) => fmtValue(v, field.format, currency);
  const toggle = (id: string) =>
    setOff((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="mt-10 rounded border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Global economy</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pick a statistic, switch states on and off, and compare them with the global average.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={statKey}
            onChange={(e) => setStatKey(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5"
            aria-label="Statistic"
          >
            {fields.map((f) => (
              <option key={f.key as string} value={f.key as string}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded border border-border text-xs">
            {(["now", "time"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                disabled={v === "time" && !canHistory}
                title={
                  v === "time" && !canHistory ? "Only filed for GDP, inflation and population" : ""
                }
                className={`px-3 py-1.5 disabled:opacity-40 ${mode === v ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              >
                {v === "now" ? "Now" : "Over time"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={showAvg}
              onChange={(e) => setShowAvg(e.target.checked)}
            />
            Global average
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {sovereign.map((n, i) => {
          const on = !off.has(n.id);
          return (
            <button
              key={n.id}
              onClick={() => toggle(n.id)}
              className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${on ? "border-foreground/40" : "border-border text-muted-foreground opacity-60"}`}
              title={n.name}
            >
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{
                  background: on ? colorOf(i) : "transparent",
                  border: `1px solid ${colorOf(i)}`,
                }}
              />
              {n.acronym}
            </button>
          );
        })}
        <button
          onClick={() => setOff(new Set())}
          className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
        >
          All
        </button>
        <button
          onClick={() => setOff(new Set(sovereign.map((n) => n.id)))}
          className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
        >
          None
        </button>
      </div>

      <div className="mt-4 h-80 w-full">
        {mode === "time" ? (
          isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading the archive…</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" tick={TICK} tickLine={false} />
                <YAxis
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tickFormatter={(v: number) => axisCompact(v, isPct)}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  formatter={(v: unknown) => (typeof v === "number" ? fmt(v) : "—")}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sovereign.map((n, i) =>
                  off.has(n.id) ? null : (
                    <Line
                      key={n.id}
                      type="monotone"
                      dataKey={n.id}
                      name={n.acronym}
                      stroke={colorOf(i)}
                      strokeWidth={1.8}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ),
                )}
                {showAvg && (
                  <Line
                    type="monotone"
                    dataKey="__avg"
                    name="Global average"
                    stroke="var(--foreground)"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={nowData.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={TICK} tickLine={false} interval={0} />
              <YAxis
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={58}
                tickFormatter={(v: number) => axisCompact(v, isPct)}
              />
              <Tooltip
                cursor={{ fill: "var(--secondary)", opacity: 0.4 }}
                formatter={(v: unknown) => (typeof v === "number" ? fmt(v) : "—")}
                labelFormatter={(_l, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" name={field.label} isAnimationActive={false}>
                {nowData.rows.map((r) => (
                  <Cell key={r.id} fill={r.color} />
                ))}
              </Bar>
              {showAvg && nowData.avg !== null && (
                <ReferenceLine
                  y={nowData.avg}
                  stroke="var(--foreground)"
                  strokeDasharray="6 4"
                  strokeWidth={2}
                  label={{
                    value: `Global average ${fmt(nowData.avg)}`,
                    fill: "var(--foreground)",
                    fontSize: 11,
                    position: "insideTopRight",
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Each state's figure includes its subdivisions as the register rolls them up. The average is
        the mean of the states switched on above.
      </p>
    </section>
  );
}
