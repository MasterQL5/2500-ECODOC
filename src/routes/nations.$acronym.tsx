import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BureauShell } from "@/components/BureauShell";
import { Linkify } from "@/components/Linkify";
import {
  creditTiersQuery,
  debtInstrumentsQuery,
  formulaQuery,
  gameStateQuery,
  nationsQuery,
  rulingsQuery,
  taxFormulasQuery,
} from "@/lib/queries";
import { NationInternalPanel } from "@/components/NationInternalPanel";
import { CreditTierFigure } from "@/components/CreditTierFigure";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import {
  DEFAULT_INFO_ROWS,
  NATION_FIELDS,
  amountTone,
  fmtCompact,
  growthTone,
  inflationTone,
  valueTone,
} from "@/lib/econ";
import { EditableFigure } from "@/components/EditableFigure";
import { expenditureBreakdown } from "@/lib/fiscal";
import { buildContext, totalFormulaRevenue } from "@/lib/formula";

export const Route = createFileRoute("/nations/$acronym")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.acronym} — National Dossier | Bureau of Interstellar Statistics` },
      {
        name: "description",
        content: `Registered economic, fiscal and demographic accounts for ${params.acronym}.`,
      },
      { property: "og:title", content: `${params.acronym} — National Dossier` },
      {
        property: "og:description",
        content: `Registered economic and fiscal accounts for ${params.acronym}.`,
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(nationsQuery),
      context.queryClient.ensureQueryData(rulingsQuery),
      context.queryClient.ensureQueryData(formulaQuery),
      context.queryClient.ensureQueryData(taxFormulasQuery),
      context.queryClient.ensureQueryData(creditTiersQuery),
      context.queryClient.ensureQueryData(debtInstrumentsQuery),
    ]);
  },
  notFoundComponent: () => (
    <BureauShell>
      <h1 className="text-2xl font-bold text-primary">No such registry</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That acronym is not filed with the Bureau.{" "}
        <Link to="/nations" className="text-accent hover:underline">
          Return to the register
        </Link>
        .
      </p>
    </BureauShell>
  ),
  component: NationDossier,
});

function NationDossier() {
  const { acronym } = Route.useParams();
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const { data: creditTiers } = useSuspenseQuery(creditTiersQuery);
  const { data: allDebtInstruments } = useSuspenseQuery(debtInstrumentsQuery);
  useNumberDisplay(); // subscribe so toggling short/full numbers re-renders this page's figures
  const { data: rulings } = useSuspenseQuery(rulingsQuery);
  const { data: formula } = useSuspenseQuery(formulaQuery);
  const { data: allTaxes } = useSuspenseQuery(taxFormulasQuery);
  const [tab, setTab] = useState<"information" | "economic" | "fiscal">("information");
  const nation = nations.find((n) => n.acronym.toLowerCase() === acronym.toLowerCase());
  if (!nation) throw notFound();

  const cur = "C$";
  const children = nations.filter((n) => n.parent_acronym === nation.acronym);
  const debtForNation = allDebtInstruments.filter((d) => d.nation_id === nation.id);
  const parent = nation.parent_acronym
    ? nations.find((n) => n.acronym === nation.parent_acronym)
    : null;
  const related = rulings.filter(
    (r) =>
      r.status === "applied" &&
      r.effects?.some((e) => e.kind === "nation" && e.target === nation.acronym),
  );

  const groups =
    tab === "fiscal" ? (["Fiscal"] as const) : (["Economic", "Demographic", "Misc"] as const);
  const infoRows =
    nation.info_rows && nation.info_rows.length > 0 ? nation.info_rows : DEFAULT_INFO_ROWS;
  const TABS = [
    ["information", "Information"],
    ["economic", "Economic accounts"],
    ["fiscal", "Fiscal accounts"],
  ] as const;

  return (
    <BureauShell>
      <div className="mb-6">
        <Link to="/nations" className="rule-label hover:text-primary">
          ← Register
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          {nation.flag_url && (
            <img
              src={nation.flag_url}
              alt={`Flag of ${nation.name}`}
              className="h-8 w-12 self-center border border-border object-cover"
            />
          )}
          <h1 className="text-3xl font-bold text-primary">{nation.name}</h1>
          <span className="rounded border border-border px-2 py-0.5 text-xs tracking-widest text-muted-foreground">
            {nation.acronym}
          </span>
          {parent && (
            <Link
              to="/nations/$acronym"
              params={{ acronym: parent.acronym }}
              className="text-xs text-accent hover:underline"
            >
              subdivision of {parent.name}
            </Link>
          )}
        </div>
        {nation.summary && (
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-foreground/90">
            <Linkify text={nation.summary} />
          </p>
        )}
        {nation.notes && (
          <p className="mt-2 text-sm text-muted-foreground">
            <Linkify text={nation.notes} />
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rule-label rounded border px-3 py-1.5 ${
              tab === key
                ? "border-primary text-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "information" ? (
        <section className="rounded border border-border bg-card p-4">
          {nation.flag_url && (
            <img
              src={nation.flag_url}
              alt={`Flag of ${nation.name}`}
              className="mb-4 h-28 w-auto border border-border object-contain"
            />
          )}
          <dl className="grid gap-x-8 sm:grid-cols-2">
            {infoRows.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 text-sm"
              >
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </dt>
                <dd className="text-right font-medium">
                  <Linkify text={r.value || "—"} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <>
          {(() => {
            const ctx = buildContext(nation, formula as Record<string, number>);
            const taxes = allTaxes.filter((t) => t.nation_id === nation.id);
            const revenueTotal =
              taxes.length > 0 ? totalFormulaRevenue(taxes, ctx) : (nation.revenue ?? 0);
            const expenditure =
              nation.expenditures ??
              expenditureBreakdown(nation, revenueTotal).reduce((s, i) => s + i.amount, 0);
            const net = revenueTotal - expenditure;
            return (
              <div className="mb-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded border border-border bg-card p-4">
                  <div className="rule-label">Total revenue</div>
                  <div className="tabular text-xl font-bold text-gain">
                    {fmtCompact(revenueTotal, cur)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {taxes.length > 0
                      ? `${taxes.length} filed revenue formulas`
                      : "No formulas filed — registered figure shown"}
                  </div>
                </div>
                <div className="rounded border border-border bg-card p-4">
                  <div className="rule-label">Total expenditure</div>
                  <div className="tabular text-xl font-bold text-loss">
                    {fmtCompact(expenditure, cur)}
                  </div>
                </div>
                <div className="rounded border border-border bg-card p-4">
                  <div className="rule-label">{net >= 0 ? "Net surplus" : "Net deficit"}</div>
                  <div className={`tabular text-xl font-bold ${amountTone(net)}`}>
                    {fmtCompact(net, cur)}
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <section key={g} className="rounded border border-border bg-card p-4">
                <h2 className="rule-label mb-3">{g} accounts</h2>
                <dl className="space-y-1.5 text-sm">
                  {NATION_FIELDS.filter((f) => f.group === g).map((f) => (
                    <div
                      key={f.key as string}
                      className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1"
                    >
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                        {f.label}
                      </dt>
                      <dd
                        className={`tabular font-medium ${
                          f.key === "inflation_rate"
                            ? inflationTone(nation.inflation_rate, nation.growth_rate)
                            : f.key === "growth_rate"
                              ? growthTone(nation.growth_rate, nation.inflation_rate)
                              : valueTone(f.key as string, nation[f.key])
                        }`}
                      >
                        {f.key === "credit_rating" ? (
                          <CreditTierFigure
                            nationId={nation.id}
                            tierId={nation.credit_tier_id}
                            tiers={creditTiers}
                          />
                        ) : (
                          <EditableFigure
                            table="nations"
                            invalidateKey="nations"
                            id={nation.id}
                            field={f.key as string}
                            value={nation[f.key]}
                            format={f.format}
                            currency={cur}
                          />
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </>
      )}

      <NationInternalPanel nation={nation} currency={cur} formula={formula} />

      {debtForNation.length > 0 && (
        <section className="mt-8 rounded border border-border bg-card p-4">
          <h2 className="mb-3 text-xl font-bold">Debt on file</h2>
          <div className="space-y-2">
            {debtForNation.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded border border-border/60 p-2 text-sm"
              >
                <div className="min-w-[140px] flex-1">
                  <div className="font-medium">
                    {d.label}
                    {d.is_general && (
                      <span className="ml-2 rounded border border-border px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        general
                      </span>
                    )}
                  </div>
                  {d.credit_tier_name_at_issue && (
                    <div className="text-[11px] text-muted-foreground">
                      Issued at {d.credit_tier_name_at_issue}
                      {d.issued_year ? ` · ${d.issued_year}` : ""}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="tabular font-medium">{fmtCompact(d.principal, cur)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(d.interest_rate * 100).toFixed(2)}% ·{" "}
                    {fmtCompact(d.principal * d.interest_rate, cur)}/yr
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Rates are locked in at issue and don't change even if this state's credit tier moves
            later. Managed from the Formula Workbench's Debt &amp; Credit tab.
          </p>
        </section>
      )}

      {children.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold">Constituent registries</h2>
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                to="/nations/$acronym"
                params={{ acronym: c.acronym }}
                className="rounded border border-border bg-card px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-bold">Rulings affecting this state</h2>
        {related.length === 0 ? (
          <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
            No rulings on record.
          </p>
        ) : (
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id} className="rounded border border-border bg-card p-3">
                <div className="rule-label">Year {r.year}</div>
                <div className="text-sm font-semibold text-primary">{r.title}</div>
                {r.body && <p className="mt-1 text-xs text-muted-foreground">{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </BureauShell>
  );
}
