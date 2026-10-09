import { useState } from "react";
import { Link } from "@tanstack/react-router";
import mapAsset from "@/assets/world-map.png.asset.json";
import { fmtCompact, fmtPct, type Nation } from "@/lib/econ";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";

export function WorldMap({ nations, currency }: { nations: Nation[]; currency: string }) {
  const [active, setActive] = useState<Nation | null>(null);
  useNumberDisplay(); // subscribe so toggling short/full numbers re-renders the map's popup
  const plotted = nations.filter((n) => n.map_x !== null && n.map_y !== null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="relative overflow-hidden rounded border border-border bg-card">
        <img
          src={mapAsset.url}
          alt="Political map of Earth in the year 2500 showing member states of the exchange"
          className="w-full select-none opacity-90"
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 bg-primary/5 mix-blend-overlay" />
        {plotted.map((n) => {
          const isActive = active?.id === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setActive(n)}
              onMouseEnter={() => setActive(n)}
              style={{ left: `${n.map_x}%`, top: `${n.map_y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              aria-label={n.name}
            >
              <span
                className={`block rounded-full border transition-all ${
                  isActive
                    ? "size-3.5 border-primary bg-primary shadow-[0_0_0_6px_var(--primary)]/20"
                    : "size-2.5 border-accent bg-accent/70 hover:size-3.5"
                }`}
              />
            </button>
          );
        })}
      </div>

      <aside className="rounded border border-border bg-card p-4">
        {active ? (
          <div className="space-y-3">
            <div>
              <div className="rule-label">{active.acronym}</div>
              <h3 className="text-lg font-bold text-primary">{active.name}</h3>
            </div>
            <dl className="space-y-1.5 text-sm">
              <Row label="GDP (PPP)" value={fmtCompact(active.gdp_ppp, currency)} />
              <Row label="GDP (nominal)" value={fmtCompact(active.gdp_nominal, currency)} />
              <Row label="Growth" value={fmtPct(active.growth_rate)} />
              <Row label="Inflation" value={fmtPct(active.inflation_rate)} />
              <Row label="Population" value={fmtCompact(active.population)} />
              <Row label="Treasury" value={fmtCompact(active.treasury, currency)} />
              <Row label="Debt" value={fmtCompact(active.debt, currency)} />
              <Row label="Credit rating" value={active.credit_rating ?? "—"} />
            </dl>
            <Link
              to="/nations/$acronym"
              params={{ acronym: active.acronym }}
              className="inline-block rounded border border-primary/50 px-3 py-1.5 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
            >
              Full dossier
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a marker on the atlas to read that state's registered accounts.
          </p>
        )}
        <div className="mt-6 border-t border-border pt-3">
          <div className="rule-label mb-2">Unplotted registries</div>
          <div className="flex flex-wrap gap-1">
            {nations
              .filter((n) => n.map_x === null || n.map_y === null)
              .map((n) => (
                <Link
                  key={n.id}
                  to="/nations/$acronym"
                  params={{ acronym: n.acronym }}
                  className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-primary"
                >
                  {n.acronym}
                </Link>
              ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
