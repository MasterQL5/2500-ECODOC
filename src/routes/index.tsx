import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BureauShell } from "@/components/BureauShell";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { gameStateQuery, nationsQuery, rulingsQuery } from "@/lib/queries";
import { fmtCompact, fmtPct, nationTotal } from "@/lib/econ";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bureau of Interstellar Statistics — National Accounts" },
      {
        name: "description",
        content: "Official register of national accounts and fiscal standing for the year 2500.",
      },
      { property: "og:title", content: "Bureau of Interstellar Statistics" },
      {
        property: "og:description",
        content: "National accounts of the year 2500.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(nationsQuery),
      context.queryClient.ensureQueryData(rulingsQuery),
    ]);
  },
  component: Overview,
});

function Overview() {
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const { data: rulings } = useSuspenseQuery(rulingsQuery);
  useNumberDisplay(); // subscribe so the short/full number toggle re-renders this page's figures

  const cur = state.currency_code === "TRI" ? "▲" : "C$";
  const sovereign = nations.filter((n) => !n.parent_acronym);
  const worldGdp = sovereign.reduce(
    (sum, n) => sum + (nationTotal(n, nations, "gdp_real") ?? 0),
    0,
  );
  const worldPop = sovereign.reduce(
    (sum, n) => sum + (nationTotal(n, nations, "population") ?? 0),
    0,
  );
  const withInfl = sovereign.filter((n) => n.inflation_rate !== null);
  const avgInflation =
    withInfl.reduce((s, n) => s + (n.inflation_rate ?? 0), 0) / Math.max(1, withInfl.length);
  const withRatio = sovereign.filter((n) => n.inflation_ratio !== null);
  const avgRatio =
    withRatio.reduce((s, n) => s + (n.inflation_ratio ?? 0), 0) / Math.max(1, withRatio.length);

  const top = [...sovereign]
    .sort(
      (a, b) =>
        (nationTotal(b, nations, "gdp_real") ?? 0) - (nationTotal(a, nations, "gdp_real") ?? 0),
    )
    .slice(0, 10);

  const applied = rulings.filter((r) => r.status === "applied").slice(0, 5);

  return (
    <BureauShell>
      <section className="mb-8 rounded border border-border bg-card p-6">
        <div className="rule-label">Bulletin — fiscal year {state.current_year}</div>
        <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">National Accounts</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Figures below are the registered valuations of record.
        </p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Gross world product (real)" value={fmtCompact(worldGdp, cur)} />
          <Stat label="Registered population" value={fmtCompact(worldPop)} />
          <Stat label={`Mean inflation ${state.current_year}`} value={fmtPct(avgInflation)} />
          <Stat
            label={`Mean inflation ratio since ${state.base_year}`}
            value={avgRatio.toFixed(4)}
          />
        </dl>
      </section>

      <section className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Leading economies</h2>
            <Link to="/nations" className="rule-label hover:text-primary">
              All nations →
            </Link>
          </div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr className="rule-label">
                  <th className="px-3 py-2 text-left">State</th>
                  <th className="px-3 py-2 text-right">GDP (real)</th>
                  <th className="px-3 py-2 text-right">Growth</th>
                  <th className="px-3 py-2 text-right">Inflation</th>
                  <th className="px-3 py-2 text-right">Infl. ratio</th>

                  <th className="px-3 py-2 text-right">Rating</th>
                </tr>
              </thead>
              <tbody>
                {top.map((n) => (
                  <tr key={n.id} className="border-t border-border hover:bg-secondary/50">
                    <td className="px-3 py-2">
                      <Link
                        to="/nations/$acronym"
                        params={{ acronym: n.acronym }}
                        className="hover:text-primary"
                      >
                        <span className="text-muted-foreground">{n.acronym}</span> {n.name}
                      </Link>
                    </td>
                    <td className="tabular px-3 py-2 text-right">
                      {fmtCompact(nationTotal(n, nations, "gdp_real"), cur)}
                    </td>
                    <td className="tabular px-3 py-2 text-right">
                      <Change value={n.growth_rate} />
                    </td>
                    <td className="tabular px-3 py-2 text-right">{fmtPct(n.inflation_rate)}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {n.inflation_ratio === null ? "—" : n.inflation_ratio.toFixed(3)}
                    </td>

                    <td className="px-3 py-2 text-right">{n.credit_rating ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Latest rulings</h2>
            <Link to="/gazette" className="rule-label hover:text-primary">
              Gazette →
            </Link>
          </div>
          <div className="space-y-2">
            {applied.length === 0 && (
              <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
                No rulings entered on the register.
              </p>
            )}
            {applied.map((r) => (
              <article key={r.id} className="rounded border border-border bg-card p-3">
                <div className="rule-label">Year {r.year}</div>
                <h3 className="text-sm font-semibold text-primary">{r.title}</h3>
                {r.body && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{r.body}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </BureauShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/40 p-3">
      <dt className="rule-label">{label}</dt>
      <dd className="tabular mt-1 font-display text-2xl font-bold text-foreground">{value}</dd>
    </div>
  );
}

export function Change({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="tabular text-xs text-muted-foreground">—</span>;
  const cls = value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-neutral";
  const sign = value > 0 ? "▲" : value < 0 ? "▼" : "■";
  return (
    <span className={`tabular text-xs font-medium ${cls}`}>
      {sign} {fmtPct(Math.abs(value))}
    </span>
  );
}
