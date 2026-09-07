import { useState } from "react";
import galaxyAsset from "@/assets/galaxy-map.png.asset.json";
import type { Nation } from "@/lib/econ";
import { WorldMap } from "./WorldMap";

type View = "earth" | "solar" | "galaxy";

const VIEWS: { id: View; label: string }[] = [
  { id: "earth", label: "Earth" },
  { id: "solar", label: "Solar system" },
  { id: "galaxy", label: "Galaxy" },
];

const PLANETS = [
  { id: "sol", label: "Sol", r: 26, orbit: 0, color: "var(--primary)" },
  { id: "mercury", label: "Mercury", r: 4, orbit: 60 },
  { id: "venus", label: "Venus", r: 7, orbit: 95 },
  { id: "earth", label: "Earth", r: 8, orbit: 135 },
  { id: "mars", label: "Mars", r: 6, orbit: 175 },
  { id: "belt", label: "Asteroid Belt", r: 3, orbit: 215 },
  { id: "jupiter", label: "Jupiter", r: 16, orbit: 265 },
  { id: "saturn", label: "Saturn", r: 14, orbit: 320 },
  { id: "uranus", label: "Uranus", r: 10, orbit: 365 },
  { id: "neptune", label: "Neptune", r: 10, orbit: 405 },
];

export function AtlasMaps({ nations, currency }: { nations: Nation[]; currency: string }) {
  const [view, setView] = useState<View>("earth");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <div className="order-2 lg:order-1">
        {view === "earth" && (
          <WorldMap nations={nations.filter((n) => n.body === "earth" || !n.body)} currency={currency} />
        )}

        {view === "solar" && (
          <div className="rounded border border-border bg-card p-4">
            <svg viewBox="0 0 900 460" className="w-full">
              {PLANETS.filter((p) => p.orbit > 0).map((p) => (
                <ellipse
                  key={`o-${p.id}`}
                  cx={40}
                  cy={230}
                  rx={p.orbit * 2}
                  ry={p.orbit}
                  fill="none"
                  stroke="currentColor"
                  className="text-border"
                />
              ))}
              {PLANETS.map((p) => {
                const cx = 40 + p.orbit * 2;
                const active = selected === p.id;
                return (
                  <g key={p.id} onClick={() => setSelected(p.id)} className="cursor-pointer">
                    <circle
                      cx={cx}
                      cy={230}
                      r={p.r}
                      className={active ? "fill-primary" : "fill-accent"}
                    />
                    <text
                      x={cx}
                      y={230 - p.r - 8}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {p.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="rule-label mt-2">
              {selected ? `Selected body: ${selected}` : "Select a body — dossiers pending survey"}
            </p>
          </div>
        )}

        {view === "galaxy" && (
          <div className="relative overflow-hidden rounded border border-border bg-card">
            <img
              src={galaxyAsset.url}
              alt="Chart of explored galactic systems and hyperlane routes"
              className="w-full select-none opacity-90"
              draggable={false}
            />
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-4">
              {Array.from({ length: 24 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(`sector-${i + 1}`)}
                  aria-label={`Sector ${i + 1}`}
                  className={`border border-transparent transition-colors hover:border-primary/60 hover:bg-primary/10 ${
                    selected === `sector-${i + 1}` ? "border-primary/80 bg-primary/10" : ""
                  }`}
                />
              ))}
            </div>
            <p className="rule-label absolute bottom-2 left-3">
              {selected?.startsWith("sector")
                ? `${selected.replace("-", " ")} — survey pending`
                : "Select a sector"}
            </p>
          </div>
        )}
      </div>

      <div className="order-1 flex gap-2 lg:order-2 lg:flex-col">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setView(v.id);
              setSelected(null);
            }}
            className={`rounded border px-4 py-2 text-xs uppercase tracking-widest transition-all ${
              view === v.id
                ? "border-primary bg-primary/10 text-primary shadow-[0_0_16px_var(--primary)]"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
