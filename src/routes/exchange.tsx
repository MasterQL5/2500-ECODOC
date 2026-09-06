import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BureauShell } from "@/components/BureauShell";
import { currenciesQuery, gameStateQuery, nationsQuery } from "@/lib/queries";
import { buildExchangeTable, convert } from "@/lib/exchange";
import { fmtPct } from "@/lib/econ";

export const Route = createFileRoute("/exchange")({
  head: () => ({
    meta: [
      { title: "Currency Exchange Register — Bureau of Interstellar Statistics" },
      {
        name: "description",
        content:
          "Official parities of every registered currency against the base credit, derived from cumulative inflation since the base year.",
      },
      { property: "og:title", content: "Currency Exchange Register" },
      {
        property: "og:description",
        content: "Parities of every registered currency against the base credit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(nationsQuery),
      context.queryClient.ensureQueryData(currenciesQuery),
    ]);
  },
  component: ExchangePage,
});

function ExchangePage() {
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const { data: currencies } = useSuspenseQuery(currenciesQuery);

  const rows = useMemo(() => buildExchangeTable(currencies, nations), [currencies, nations]);

  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState("C$");
  const [to, setTo] = useState(rows[0]?.code ?? "C$");

  const fromRow = rows.find((r) => r.code === from) ?? null;
  const toRow = rows.find((r) => r.code === to) ?? null;
  const converted = convert(Number(amount) || 0, fromRow, toRow);

  return (
    <BureauShell>
      <div className="mb-6">
        <div className="rule-label">Parities of record · fiscal year {state.current_year}</div>
        <h1 className="text-3xl font-bold text-primary">Currency Exchange Register</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          All parities are struck against the base credit (C$1 of {state.base_year}) and follow from
          each economy&apos;s cumulative inflation ratio since that year. A currency that has
          doubled its price level buys half a base credit.
        </p>
      </div>

      <section className="mb-8 rounded border border-border bg-card p-4">
        <div className="rule-label mb-3">Conversion desk</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="rule-label">Amount</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="tabular w-36 rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rule-label">From</span>
            <CurrencySelect value={from} onChange={setFrom} rows={rows} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rule-label">To</span>
            <CurrencySelect value={to} onChange={setTo} rows={rows} />
          </label>
          <div className="ml-auto text-right">
            <div className="rule-label">Equals</div>
            <div className="tabular font-display text-2xl font-bold text-primary">
              {toRow?.symbol ?? "C$"}
              {converted.toLocaleString("en-US", { maximumFractionDigits: 4 })}
            </div>
          </div>
        </div>
      </section>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-secondary">
            <tr className="rule-label">
              <th className="px-3 py-2 text-left">Currency</th>
              <th className="px-3 py-2 text-left">Anchor state</th>
              <th className="px-3 py-2 text-right">Inflation ratio</th>
              <th className="px-3 py-2 text-right">Price level</th>
              <th className="px-3 py-2 text-right">Unit in C$</th>
              <th className="px-3 py-2 text-right">Per C$1</th>
              <th className="px-3 py-2 text-right">Annual inflation</th>
              <th className="px-3 py-2 text-right">States</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border bg-background/40">
              <td className="px-3 py-2 font-semibold text-primary">
                C$ — Base Credit ({state.base_year})
              </td>
              <td className="px-3 py-2 text-muted-foreground">Bureau standard</td>
              <td className="tabular px-3 py-2 text-right">0.0000</td>
              <td className="tabular px-3 py-2 text-right">1.0000</td>
              <td className="tabular px-3 py-2 text-right">1.0000</td>
              <td className="tabular px-3 py-2 text-right">1.0000</td>
              <td className="tabular px-3 py-2 text-right">—</td>
              <td className="tabular px-3 py-2 text-right">—</td>
            </tr>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-border hover:bg-secondary/50">
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="mr-2 text-primary">{r.symbol}</span>
                  {r.name}
                  <span className="ml-2 text-xs text-muted-foreground">{r.code}</span>
                </td>
                <td className="px-3 py-2">
                  {r.anchor ? (
                    <Link
                      to="/nations/$acronym"
                      params={{ acronym: r.anchor.acronym }}
                      className="hover:text-primary"
                    >
                      {r.anchor.flag_emoji ? `${r.anchor.flag_emoji} ` : ""}
                      {r.anchor.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="tabular px-3 py-2 text-right">{r.inflationRatio.toFixed(4)}</td>
                <td className="tabular px-3 py-2 text-right">{r.priceLevel.toFixed(4)}</td>
                <td className="tabular px-3 py-2 text-right font-semibold text-primary">
                  {r.perUnitInBase.toFixed(4)}
                </td>
                <td className="tabular px-3 py-2 text-right">{r.perBaseCredit.toFixed(4)}</td>
                <td className="tabular px-3 py-2 text-right">
                  {r.inflationRate === null ? "—" : fmtPct(r.inflationRate)}
                </td>
                <td className="tabular px-3 py-2 text-right">{r.members.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Parities are recalculated whenever inflation figures are amended by ruling of the Bureau.
      </p>
    </BureauShell>
  );
}

function CurrencySelect({
  value,
  onChange,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: ReturnType<typeof buildExchangeTable>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
    >
      <option value="C$">C$ — Base Credit</option>
      {rows.map((r) => (
        <option key={r.code} value={r.code}>
          {r.symbol} — {r.name}
        </option>
      ))}
    </select>
  );
}
