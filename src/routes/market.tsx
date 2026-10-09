import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BureauShell } from "@/components/BureauShell";
import { Change } from "@/routes/index";
import { commoditiesQuery, gameStateQuery } from "@/lib/queries";
import { changePct, fmtPrice } from "@/lib/econ";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "World Commodity Exchange Board — Bureau of Interstellar Statistics" },
      {
        name: "description",
        content:
          "Registered prices and year-on-year movement for every commodity listed on the world exchange.",
      },
      { property: "og:title", content: "World Commodity Exchange Board" },
      {
        property: "og:description",
        content: "Registered prices and year-on-year movement for all listed commodities.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(commoditiesQuery),
    ]);
  },
  component: MarketBoard,
});

function MarketBoard() {
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { data: commodities } = useSuspenseQuery(commoditiesQuery);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const cur = "C$";

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(commodities.map((c) => c.category)))],
    [commodities],
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = commodities.filter(
      (c) =>
        (category === "All" || c.category === category) && (!q || c.name.toLowerCase().includes(q)),
    );
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return Array.from(map.entries());
  }, [commodities, query, category]);

  return (
    <BureauShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rule-label">Board of record · fiscal year {state.current_year}</div>
          <h1 className="text-3xl font-bold text-primary">World Commodity Exchange</h1>
        </div>
        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commodity…"
            className="w-56 rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="space-y-8">
        {grouped.map(([cat, rows]) => (
          <section key={cat}>
            <h2 className="rule-label mb-2 border-b border-border pb-1">{cat}</h2>
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-secondary">
                  <tr className="rule-label">
                    <th className="px-3 py-2 text-left">Commodity</th>
                    <th className="px-3 py-2 text-left">Priced per</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Prior year</th>
                    <th className="px-3 py-2 text-right">Change</th>
                    <th className="px-3 py-2 text-right">Base ({state.current_year} index)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-secondary/50">
                      <td className="px-3 py-2">
                        {c.name}
                        {c.description && (
                          <div className="text-xs text-muted-foreground">{c.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.unit ? `${c.quantity > 1 ? `${c.quantity} ` : ""}${c.unit}` : "—"}
                      </td>
                      <td className="tabular px-3 py-2 text-right font-semibold text-primary">
                        {fmtPrice(c.current_price, cur)}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-muted-foreground">
                        {fmtPrice(c.previous_price, cur)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Change value={changePct(c.current_price, c.previous_price)} />
                      </td>
                      <td className="tabular px-3 py-2 text-right text-muted-foreground">
                        {fmtPrice(c.base_price, cur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </BureauShell>
  );
}
