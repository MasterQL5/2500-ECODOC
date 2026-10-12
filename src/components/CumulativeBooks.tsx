import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { DebtInstrument } from "@/lib/debt";
import { amountTone, fmtCompact, fmtPct, type Nation } from "@/lib/econ";
import { memberBooks } from "@/lib/books";
import { resolveCategoryColors, shadesOf } from "@/lib/chartColors";
import { categoryColorsOf } from "@/lib/fiscal";
import type { TaxFormula } from "@/lib/formula";
import { MODE_META, rolledValue, type RollupMode } from "@/lib/rollup";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import {
  ExpenditureBoard,
  NO_HOVER,
  type BoardCategory,
  type Hover,
} from "@/components/ExpenditureBoard";
import { PieChart, fmtShare, type PieSlice } from "@/components/PieChart";
import { Stat } from "@/components/Stat";

type View = "state" | "subdivided";

/**
 * Cumulative revenue and expenditure of a parent whose finances are made up of its subdivisions
 * (and, for "own + subdivisions", its own books). Everything is grouped by the state it comes from,
 * so the "categories" here are the member states. Read only: each state's books are edited on its
 * own page.
 */
export function CumulativeBooks({
  nation,
  nations,
  mode,
  allTaxes,
  allDebt,
  formula,
  currency,
  onMerged,
}: {
  nation: Nation;
  nations: Nation[];
  mode: RollupMode;
  allTaxes: TaxFormula[];
  allDebt: DebtInstrument[];
  formula: Record<string, number>;
  currency: string;
  /** Told whether the parent's own books were folded into a subdivision as the same entity. */
  onMerged?: (merged: boolean) => void;
}) {
  useNumberDisplay();
  const [view, setView] = useState<View>("state");
  const [hover, setHover] = useState<Hover>(NO_HOVER);
  const [revHover, setRevHover] = useState<string | null>(null);

  const members = useMemo(() => {
    const kids = nations.filter((n) => n.parent_acronym === nation.acronym);
    const list = mode === "core_plus" ? [nation, ...kids] : kids;
    return list.map((m) => memberBooks(m, nations, allTaxes, formula, allDebt, currency));
  }, [nation, nations, mode, allTaxes, formula, allDebt, currency]);

  const names = members.map((m) => m.nation.name);
  const colors = resolveCategoryColors(names, categoryColorsOf(nation));

  const allGroups = members.map((m) => {
    const color = colors[m.nation.name]!;
    const revShades = shadesOf(color, m.streams.length);
    const expShades = shadesOf(color, m.lines.length);
    return {
      m,
      color,
      revenue: m.streams.reduce((s, r) => s + r.value, 0),
      expenditure: m.lines.reduce((s, l) => s + l.amount, 0),
      streams: m.streams.map((r, i) => ({
        ...r,
        key: `${m.nation.id}:${r.id}`,
        color: revShades[i]!,
      })),
      lines: m.lines.map((l, i) => ({ ...l, key: `${m.nation.id}:${l.id}`, color: expShades[i]! })),
    };
  });
  // "Own + subdivisions" is for a parent that is a real nation in its own right (the core) with
  // subdivisions on top. If the parent shares a name with one subdivision, or its books equal its
  // members' combined books (or one member's), they are the same entity filed twice. Count it once
  // (the subdivision's books stand for it) instead of doubling every figure on this tab.
  const near = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) <= 0.02 * Math.max(a, b);
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const parentGroup = mode === "core_plus" ? allGroups[0] : undefined;
  const others = allGroups.slice(1);
  const sameName =
    !!parentGroup && others.some((g) => slug(g.m.nation.name) === slug(parentGroup.m.nation.name));
  const looksDoubled =
    !!parentGroup &&
    [
      [parentGroup.revenue, others.map((g) => g.revenue)],
      [parentGroup.expenditure, others.map((g) => g.expenditure)],
    ].some(
      ([own, rest]) =>
        near(
          own as number,
          (rest as number[]).reduce((s, v) => s + v, 0),
        ) || (rest as number[]).some((v) => near(own as number, v)),
    );
  const mergedParent = !!parentGroup && (sameName || looksDoubled);
  useEffect(() => onMerged?.(mergedParent), [onMerged, mergedParent]);
  const groups = mergedParent ? others : allGroups;
  const revenueTotal = groups.reduce((s, g) => s + g.revenue, 0);
  const expTotal = groups.reduce((s, g) => s + g.expenditure, 0);
  const net = revenueTotal - expTotal;
  const gdp = rolledValue(nation, nations, "gdp_nominal").value ?? nation.gdp_nominal;
  const ratio = rolledValue(nation, nations, "revenue_gdp_ratio").value;
  const meta = MODE_META[mode];

  // ---- revenue pie --------------------------------------------------------------------------
  const revSlices: PieSlice[] =
    view === "state"
      ? groups.map((g) => ({
          key: `m:${g.m.nation.id}`,
          label: g.m.nation.name,
          amount: g.revenue,
          color: g.color,
          note: `${g.streams.length} revenue line${g.streams.length === 1 ? "" : "s"}`,
        }))
      : groups.flatMap((g) =>
          g.streams.map((r) => ({
            key: r.key,
            label: r.name,
            amount: r.value,
            color: r.color,
            category: g.m.nation.name,
          })),
        );
  const memberOf = (key: string) => key.split(":")[0]!;
  const revActive =
    revHover === null
      ? null
      : view === "state"
        ? `m:${memberOf(revHover.replace(/^m:/, ""))}`
        : revHover;
  const onRevActive = (key: string | null) => setRevHover(key);

  // ---- expenditure board + pie ----------------------------------------------------------------
  const board: BoardCategory[] = groups.map((g) => ({
    name: g.m.nation.name,
    color: g.color,
    rows: g.lines.map((l) => ({
      id: l.key,
      label: l.label,
      amount: l.amount,
      category: g.m.nation.name,
      locked: l.locked,
      color: l.color,
      ...(l.note ? { note: l.note } : {}),
    })),
  }));
  const expSlices: PieSlice[] =
    view === "state"
      ? board.map((c) => ({
          key: `cat:${c.name}`,
          label: c.name,
          amount: c.rows.reduce((s, r) => s + r.amount, 0),
          color: c.color,
          note: `${c.rows.length} line${c.rows.length === 1 ? "" : "s"}`,
        }))
      : board.flatMap((c) =>
          c.rows.map((r) => ({
            key: r.id,
            label: r.label,
            amount: r.amount,
            color: r.color,
            category: c.name,
          })),
        );
  const expActive = view === "state" ? (hover.cat ? `cat:${hover.cat}` : null) : hover.row;
  function onExpActive(key: string | null) {
    if (key === null) return setHover(NO_HOVER);
    if (key.startsWith("cat:") && view === "state")
      return setHover({ cat: key.slice(4), row: null });
    const cat = board.find((c) => c.rows.some((r) => r.id === key));
    setHover({ cat: cat?.name ?? null, row: key });
  }

  const toggle = (
    <div className="flex gap-1.5" role="group" aria-label="Pie chart detail">
      {(
        [
          ["state", "By state"],
          ["subdivided", "Subdivided"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={`rule-label rounded border px-2.5 py-1 ${
            view === v
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
        <span className={`mr-1.5 font-bold ${meta.className}`}>{meta.glyph}</span>
        <span className="rule-label mr-2">{meta.label}</span>
        {mode === "sum"
          ? `${nation.name} keeps no books of its own: these are the combined finances of its subdivisions, grouped by the state each figure comes from.`
          : `${nation.name}'s own books plus its subdivisions', grouped by the state each figure comes from.`}{" "}
        Each state's books are amended on its own page:{" "}
        {members.map((m, i) => (
          <span key={m.nation.id}>
            {i > 0 && ", "}
            {m.nation.id === nation.id ? (
              m.nation.name
            ) : (
              <Link
                to="/nations/$acronym"
                params={{ acronym: m.nation.acronym }}
                className="text-accent hover:underline"
              >
                {m.nation.name}
              </Link>
            )}
          </span>
        ))}
        .
      </div>

      {mergedParent && (
        <div className="rounded border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
          {nation.name}'s own books duplicate those of one of its subdivisions, so they are counted
          once, as that subdivision. Set the finance roll-up to “Sum of subdivisions” to make this
          permanent.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total revenue"
          value={fmtCompact(revenueTotal, currency)}
          tone="text-gain"
          foot={`${groups.length} contributing states`}
        />
        <Stat label="Total expenditure" value={fmtCompact(expTotal, currency)} tone="text-loss" />
        <Stat
          label={net >= 0 ? "Net surplus" : "Net deficit"}
          value={fmtCompact(net, currency)}
          tone={amountTone(net)}
        />
        <Stat
          label="Revenue to GDP"
          value={ratio === null ? "—" : fmtPct(ratio)}
          foot={gdp ? `of ${fmtCompact(gdp, currency)} nominal GDP` : "No GDP filed"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="rule-label">Revenue streams</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Every revenue line of every contributing state, and its share of the total.
              </p>
            </div>
            {toggle}
          </div>
          <div className="mt-3">
            <PieChart
              slices={revSlices}
              currency={currency}
              centerLabel="Total revenue"
              typeLabel={view === "state" ? "Contributing state" : "Revenue stream"}
              activeKey={revActive}
              onActiveChange={onRevActive}
              emptyText="No revenue filed by any member state yet."
            />
          </div>
          <div className="mt-3 rounded border border-border p-2">
            {groups.map((g) => (
              <div key={g.m.nation.id} className="border-b border-border/50 py-1 last:border-b-0">
                <div
                  onMouseEnter={() => setRevHover(`m:${g.m.nation.id}`)}
                  onMouseLeave={() => setRevHover(null)}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: g.color }}
                    />
                    <span className="truncate">{g.m.nation.name}</span>
                  </span>
                  <span className="tabular shrink-0">
                    <span className="mr-3">{fmtCompact(g.revenue, currency)}</span>
                    <span className="font-semibold text-primary">
                      {revenueTotal > 0 ? fmtShare(g.revenue / revenueTotal) : "—"}
                    </span>
                  </span>
                </div>
                {g.streams.map((r) => (
                  <div
                    key={r.key}
                    onMouseEnter={() => setRevHover(r.key)}
                    onMouseLeave={() => setRevHover(null)}
                    className={`ml-5 flex items-center justify-between gap-3 rounded px-1 text-xs ${
                      revHover === r.key ? "bg-secondary/60" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: r.color }}
                      />
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="tabular shrink-0">
                      <span className="mr-3">{fmtCompact(r.value, currency)}</span>
                      <span className="font-semibold text-primary">
                        {revenueTotal > 0 ? fmtShare(r.value / revenueTotal) : "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="rule-label">Expenditure</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Every expenditure line of every contributing state, debt interest included.
              </p>
            </div>
            {toggle}
          </div>
          <div className="mt-3">
            <PieChart
              slices={expSlices}
              currency={currency}
              centerLabel="Total expenditure"
              typeLabel={view === "state" ? "Contributing state" : "Expenditure line"}
              activeKey={expActive}
              onActiveChange={onExpActive}
              emptyText="No expenditure filed by any member state yet."
            />
          </div>
          <ul className="mt-3 space-y-0.5 text-sm">
            {board.map((c) => {
              const sum = c.rows.reduce((s, r) => s + r.amount, 0);
              return (
                <li
                  key={c.name}
                  onMouseEnter={() => setHover({ cat: c.name, row: null })}
                  onMouseLeave={() => setHover(NO_HOVER)}
                  className={`flex items-center justify-between gap-3 rounded px-1.5 py-0.5 ${
                    hover.cat === c.name && hover.row === null ? "bg-secondary" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: c.color }}
                    />
                    <span className="truncate text-muted-foreground">{c.name}</span>
                  </span>
                  <span className="tabular shrink-0">
                    <span className="mr-3">{fmtCompact(sum, currency)}</span>
                    <span className="font-semibold text-primary">
                      {expTotal > 0 ? fmtShare(sum / expTotal) : "—"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="rounded border border-border bg-card p-4">
        <h2 className="rule-label">Expenditures by state</h2>
        <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">
          One column per contributing state, with its lines underneath. Debt lines are locked.
        </p>
        <ExpenditureBoard
          categories={board}
          total={expTotal}
          currency={currency}
          hover={hover}
          onHover={setHover}
          placeholderCategory=""
        />
      </section>
    </div>
  );
}
