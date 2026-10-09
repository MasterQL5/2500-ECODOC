import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { BureauShell } from "@/components/BureauShell";
import { gameStateQuery, snapshotYearsQuery, snapshotsForYearQuery } from "@/lib/queries";
import { NATION_FIELDS, debtGdpTone, fmtValue, valueTone } from "@/lib/econ";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";

const ARCHIVE_NATION_FIELDS = NATION_FIELDS.filter((f) => f.key !== "credit_rating");

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Historical Archive — Bureau of Interstellar Statistics" },
      {
        name: "description",
        content: "Filed national accounts from closed fiscal years, preserved on advancement.",
      },
      { property: "og:title", content: "Historical Archive — Bureau of Interstellar Statistics" },
      {
        property: "og:description",
        content: "Browse national accounts from previous fiscal years.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(snapshotYearsQuery),
    ]);
  },
  component: ArchivePage,
});

function ArchivePage() {
  const { data: state } = useSuspenseQuery(gameStateQuery);
  useNumberDisplay(); // subscribe so toggling short/full numbers re-renders archived figures
  const { data: years } = useSuspenseQuery(snapshotYearsQuery);
  const [year, setYear] = useState<number | null>(years[0] ?? null);
  const { data: rows = [], isLoading } = useQuery({
    ...snapshotsForYearQuery(year ?? 0),
    enabled: year !== null,
  });

  const nations = rows.filter((r) => r.kind === "nation");
  const cur = state.currency_code;

  return (
    <BureauShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rule-label">Closed fiscal years</div>
          <h1 className="text-3xl font-bold text-primary">Historical Archive</h1>
        </div>
        {years.length > 0 && (
          <select
            value={year ?? ""}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                Fiscal year {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {years.length === 0 ? (
        <p className="rounded border border-dashed border-border p-6 text-sm text-muted-foreground">
          No years have been closed yet. The Bureau files a complete copy of every register when the
          game master advances the fiscal year.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Retrieving filed volumes…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="rule-label mb-2 border-b border-border pb-1">National accounts</h2>
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr className="rule-label">
                    <th className="sticky left-0 z-10 bg-secondary px-3 py-2 text-left">State</th>
                    {ARCHIVE_NATION_FIELDS.map((f) => (
                      <th key={f.key} className="whitespace-nowrap px-3 py-2 text-right">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nations.map((r) => {
                    const d = r.data as Record<string, unknown>;
                    // Debt to GDP is computed, so older filings (which never stored it) show it too.
                    const debt = d["debt"];
                    const gdp = d["gdp_nominal"];
                    const ratio =
                      typeof d["debt_gdp_ratio"] === "number"
                        ? d["debt_gdp_ratio"]
                        : typeof debt === "number" && typeof gdp === "number" && gdp > 0
                          ? debt / gdp
                          : null;
                    const row: Record<string, unknown> = { ...d, debt_gdp_ratio: ratio };
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-secondary/50">
                        <td className="sticky left-0 z-10 bg-card px-3 py-2">
                          {String(d["name"] ?? d["acronym"] ?? "—")}
                        </td>
                        {ARCHIVE_NATION_FIELDS.map((f) => (
                          <td
                            key={f.key}
                            className={`tabular whitespace-nowrap px-3 py-2 text-right ${
                              f.key === "debt" || f.key === "debt_gdp_ratio"
                                ? debtGdpTone(ratio)
                                : valueTone(f.key, row[f.key])
                            }`}
                          >
                            {fmtValue(row[f.key], f.format, cur)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Every field on file for each state at the time this year was closed.
            </p>
          </section>
        </div>
      )}
    </BureauShell>
  );
}
