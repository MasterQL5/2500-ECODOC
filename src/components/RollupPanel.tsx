import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Nation } from "@/lib/econ";
import {
  AVERAGED_FIELDS,
  FIELD_DOMAIN,
  MODE_META,
  ROLLUP_DOMAINS,
  ROLLUP_MODES,
  checkRollups,
  childrenOf,
  fiscalWithRollup,
  rollupSettings,
  type RollupDomain,
  type RollupMode,
} from "@/lib/rollup";

/** Small coloured Σ / + / ◦ marker beside a parent's collapsed figure. */
export function ModeGlyph({
  parent,
  nations,
  field,
  collapsed,
}: {
  parent: Nation;
  nations: Nation[];
  field: string;
  collapsed: boolean;
}) {
  const domain =
    FIELD_DOMAIN[field] ??
    AVERAGED_FIELDS[field]?.domain ??
    (field === "ppp_conversion" || field === "gdp_per_capita"
      ? "economy"
      : field === "debt_gdp_ratio"
        ? "finance"
        : undefined);
  if (!collapsed || !domain || childrenOf(parent, nations).length === 0) return null;
  const mode = rollupSettings(parent)[domain];
  const meta = MODE_META[mode];
  return (
    <span
      className={`mr-1 text-[10px] font-bold ${meta.className}`}
      title={`${meta.label} (${ROLLUP_DOMAINS.find((d) => d.key === domain)?.label})`}
    >
      {meta.glyph}
    </span>
  );
}

export function ModeLegend() {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {ROLLUP_MODES.map((m) => (
        <span key={m}>
          <span className={`font-bold ${MODE_META[m].className}`}>{MODE_META[m].glyph}</span>{" "}
          {MODE_META[m].short}
        </span>
      ))}
    </span>
  );
}

/**
 * Per-parent roll-up settings (GDP, population, finances) plus the double-counting checker.
 * `only` limits it to one parent (used on a nation's own page). Non-GMs see it read-only.
 */
export function RollupPanel({
  nations,
  isGm,
  only,
}: {
  nations: Nation[];
  isGm: boolean;
  only?: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const parents = nations.filter(
    (n) => !n.parent_acronym && childrenOf(n, nations).length > 0 && (!only || n.acronym === only),
  );
  const issues = checkRollups(nations).filter((i) => !only || i.parent === only);

  async function setMode(parent: Nation, domain: RollupDomain, mode: RollupMode) {
    setBusy(`${parent.acronym}:${domain}`);
    const { error } = await supabase
      .from("nations")
      .update({ fiscal: fiscalWithRollup(parent, domain, mode) } as never)
      .eq("id", parent.id);
    setBusy(null);
    if (error) {
      toast.error(`Could not change setting: ${error.message}`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["nations"] });
    toast.success(`${parent.acronym}: ${domain} → ${MODE_META[mode].short}`);
  }

  if (parents.length === 0) return null;

  return (
    <section className="rounded border border-border bg-card p-4">
      <h2 className="rule-label mb-1">How subdivisions combine</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Chosen per statistic group, for each tag with subdivisions. <ModeLegend />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-1 pr-3">Tag</th>
              {ROLLUP_DOMAINS.map((d) => (
                <th key={d.key} className="py-1 pr-3">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parents.map((p) => {
              const s = rollupSettings(p);
              return (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-3">
                    <span className="text-muted-foreground">{p.acronym}</span> {p.name}
                  </td>
                  {ROLLUP_DOMAINS.map((d) => (
                    <td key={d.key} className="py-1.5 pr-3">
                      {isGm ? (
                        <select
                          value={s[d.key]}
                          disabled={busy === `${p.acronym}:${d.key}`}
                          onChange={(e) => setMode(p, d.key, e.target.value as RollupMode)}
                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                        >
                          {ROLLUP_MODES.map((m) => (
                            <option key={m} value={m}>
                              {MODE_META[m].glyph} {MODE_META[m].short}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`font-bold ${MODE_META[s[d.key]].className}`}>
                          {MODE_META[s[d.key]].glyph}{" "}
                          <span className="font-normal text-muted-foreground">
                            {MODE_META[s[d.key]].short}
                          </span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {issues.length > 0 && (
        <div className="mt-4">
          <h3 className="rule-label mb-1">Checks ({issues.length})</h3>
          <ul className="space-y-1.5 text-sm">
            {issues.map((i) => {
              const p = nations.find((n) => n.acronym === i.parent);
              return (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2 py-1.5"
                >
                  <span
                    className={i.severity === "warn" ? "text-amber-400" : "text-muted-foreground"}
                  >
                    {i.message}
                  </span>
                  {isGm && i.fix && p && (
                    <button
                      onClick={() => setMode(p, i.domain, i.fix!.mode)}
                      className="rounded border border-primary px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                    >
                      {i.fix.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
