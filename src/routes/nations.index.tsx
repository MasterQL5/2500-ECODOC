import { ModeGlyph } from "@/components/RollupPanel";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BureauShell } from "@/components/BureauShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { creditTiersQuery, gameStateQuery, nationsQuery } from "@/lib/queries";
import { CreditTierFigure } from "@/components/CreditTierFigure";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import {
  ADDITIVE_FIELDS,
  NATION_FIELDS,
  fmtValue,
  growthTone,
  inflationTone,
  nationTotal,
  valueTone,
  type FieldDef,
  type Nation,
} from "@/lib/econ";

/** Row-aware tone: inflation and growth read each other to decide colour (see growthTone /
 * inflationTone), everything else uses the ordinary single-value tone. */
function rowTone(key: string, row: Record<string, unknown>): string {
  if (key === "inflation_rate")
    return inflationTone(
      row["inflation_rate"] as number | null,
      row["growth_rate"] as number | null,
    );
  if (key === "growth_rate")
    return growthTone(row["growth_rate"] as number | null, row["inflation_rate"] as number | null);
  return valueTone(key, row[key]);
}
import { EditableFigure } from "@/components/EditableFigure";

const COLUMN_ORDER = [
  "gdp_real",
  "gdp_nominal",
  "growth_rate",
  "inflation_rate",
  "inflation_ratio",
  "population",
  "pop_growth",
  "gdp_per_capita",
  "revenue",
  "expenditures",
  "net_income",
  "treasury",
  "debt",
  "credit_rating",
];

// Shown by default; the rest are available via the "Columns" picker so the sheet fits without
// horizontal scrolling on an ordinary screen. Sort still works on any column, shown or not.
const DEFAULT_VISIBLE_COLUMNS = new Set([
  "gdp_real",
  "growth_rate",
  "population",
  "revenue",
  "net_income",
  "debt",
]);

const VISIBLE_COLUMNS_STORAGE_KEY = "sohbos:nations-visible-columns";

/** Restore whichever columns the player last chose in this browser, falling back to the
 * default set — so refreshing or navigating away no longer resets the Columns picker. */
function loadVisibleColumns(): Set<string> {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const raw = window.localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string") && parsed.length > 0) {
      return new Set(parsed);
    }
  } catch {
    // malformed storage — fall through to default
  }
  return DEFAULT_VISIBLE_COLUMNS;
}

const COLUMNS: FieldDef[] = COLUMN_ORDER.map((k) =>
  NATION_FIELDS.find((f) => (f.key as string) === k)!,
);

export const Route = createFileRoute("/nations/")({
  head: () => ({
    meta: [
      { title: "National Accounts Register — Bureau of Interstellar Statistics" },
      {
        name: "description",
        content:
          "Complete register of member states: GDP, inflation, treasury, debt, population and credit standing.",
      },
      { property: "og:title", content: "National Accounts Register" },
      {
        property: "og:description",
        content: "Complete economic register of every member state of the exchange.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(nationsQuery),
      context.queryClient.ensureQueryData(creditTiersQuery),
    ]);
  },
  component: NationsIndex,
});

function NationsIndex() {
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const { data: creditTiers } = useSuspenseQuery(creditTiersQuery);
  const { isGm } = useSession();
  const qc = useQueryClient();
  useNumberDisplay(); // subscribe so toggling short/full numbers re-renders this table's figures
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("gdp_real");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => loadVisibleColumns());

  useEffect(() => {
    try {
      window.localStorage.setItem(
        VISIBLE_COLUMNS_STORAGE_KEY,
        JSON.stringify(Array.from(visibleColumns)),
      );
    } catch {
      // storage unavailable (private browsing, quota, etc.) — the picker still works for
      // this session, it just won't persist across a refresh
    }
  }, [visibleColumns]);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [draggedAcronym, setDraggedAcronym] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    acronym: string;
    mode: "subordinate" | "release";
  } | null>(null);
  const [busyAcronym, setBusyAcronym] = useState<string | null>(null);
  const cur = "C$";

  /** Strip an existing "PARENT - " prefix so a nation can be re-prefixed under a new parent. */
  function bareAcronym(n: Nation): string {
    const parts = n.acronym.split(" - ");
    return parts.length > 1 ? parts[parts.length - 1]! : n.acronym;
  }

  async function makeSubdivision(childAcronym: string, parentAcronym: string) {
    if (childAcronym === parentAcronym) return;
    const child = nations.find((n) => n.acronym === childAcronym);
    const parent = nations.find((n) => n.acronym === parentAcronym);
    if (!child || !parent) return;
    if (parent.parent_acronym) {
      toast.error("Cannot make a subdivision of a subdivision — drag onto a sovereign state");
      return;
    }
    if (nations.some((n) => n.parent_acronym === childAcronym)) {
      toast.error("This state has its own subdivisions — detach them first");
      return;
    }
    const newAcronym = `${parent.acronym} - ${bareAcronym(child)}`;
    if (newAcronym !== child.acronym && nations.some((n) => n.acronym === newAcronym)) {
      toast.error("That acronym is already taken");
      return;
    }
    setBusyAcronym(childAcronym);
    try {
      const { error } = await supabase
        .from("nations")
        .update({
          parent_acronym: parent.acronym,
          acronym: newAcronym,
          currency_group: parent.currency_group ?? parent.acronym,
          currency_name: parent.currency_name,
          currency_symbol: parent.currency_symbol,
        } as never)
        .eq("id", child.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["nations"] });
      toast.success(`${child.name} is now a subdivision of ${parent.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the registry");
    } finally {
      setBusyAcronym(null);
    }
  }

  async function releaseSubdivision(acronym: string) {
    const n = nations.find((x) => x.acronym === acronym);
    if (!n || !n.parent_acronym) return;
    const newAcronym = bareAcronym(n);
    if (newAcronym !== n.acronym && nations.some((x) => x.acronym === newAcronym)) {
      toast.error("That acronym is already taken once detached — rename first");
      return;
    }
    setBusyAcronym(acronym);
    try {
      const { error } = await supabase
        .from("nations")
        .update({ parent_acronym: null, acronym: newAcronym } as never)
        .eq("id", n.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["nations"] });
      toast.success(`${n.name} is now a sovereign registry`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the registry");
    } finally {
      setBusyAcronym(null);
    }
  }

  function rowDragProps(n: Nation) {
    if (!isGm) return {};
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        setDraggedAcronym(n.acronym);
      },
      onDragEnd: () => {
        setDraggedAcronym(null);
        setDropTarget(null);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!draggedAcronym || draggedAcronym === n.acronym) return;
        e.preventDefault();
        setDropTarget({ acronym: n.acronym, mode: "subordinate" });
      },
      onDragLeave: () => {
        setDropTarget((t) => (t?.acronym === n.acronym ? null : t));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggedAcronym && draggedAcronym !== n.acronym) {
          void makeSubdivision(draggedAcronym, n.acronym);
        }
        setDraggedAcronym(null);
        setDropTarget(null);
      },
    };
  }

  /** Fields APE averages across every real nation and subdivision on file (rates, ratios, and
   * per-capita figures — not raw additive totals like population or GDP, which wouldn't mean
   * anything averaged rather than summed). */
  /** APE averages every meaningful numeric field across every real nation and subdivision on
   * file — GDP, population, revenue and the like included, not just rates and ratios. An
   * "average economy" is the typical nation's GDP/population/etc, not a sum of everyone's, so
   * these are averaged the same way the rate fields are, never summed. */
  const APE_AVERAGED_FIELDS = [
    "inflation_rate",
    "inflation_ratio",
    "growth_rate",
    "pop_growth",
    "gdp_nominal",
    "gdp_real",
    "gdp_ppp",
    "gdp_per_capita",
    "population",
    "revenue",
    "expenditures",
    "net_income",
    "treasury",
    "debt",
    "debt_treasury_ratio",
    "revenue_gdp_ratio",
  ] as const;

  /** APE ("Average Player Economy") is computed live from every real nation and subdivision on
   * file — never from a stored row for it, if one still exists from before this was computed —
   * so it can never go stale the way a stored snapshot would the moment anyone advances the year
   * or edits a figure. Every field it shows is a genuine average, not a leftover value copied
   * from whichever nation happened to be first in the list. */
  function computeApe(nations: Nation[]): Nation {
    // Only real, standalone nations count toward the average — not subdivisions (which would
    // double-count a sovereign that's already itself a real total) and not APE's own old row.
    const real = nations.filter((n) => n.acronym !== "APE" && !n.parent_acronym);
    const avg = (key: (typeof APE_AVERAGED_FIELDS)[number]) => {
      const values = real
        .map((n) => nationTotal(n, nations, key as keyof Nation))
        .filter((v): v is number => typeof v === "number");
      if (values.length === 0) return null;
      return values.reduce((s, v) => s + v, 0) / values.length;
    };
    const ape = {
      id: "__ape__",
      acronym: "APE",
      name: "Average Player Economy",
      parent_acronym: null,
      flag_url: null,
      flag_emoji: null,
      display_acronym: null,
      credit_rating: null,
      credit_tier_id: null,
    } as unknown as Record<string, unknown>;
    for (const key of APE_AVERAGED_FIELDS) {
      ape[key] = avg(key);
    }
    return ape as unknown as Nation;
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (n: Nation) =>
      !q || n.name.toLowerCase().includes(q) || n.acronym.toLowerCase().includes(q);

    const cmp = (a: Nation, b: Nation) => {
      const av = a[sortKey as keyof Nation];
      const bv = b[sortKey as keyof Nation];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    };

    const parents = nations.filter((n) => !n.parent_acronym && n.acronym !== "APE");
    const kids = (acr: string) => nations.filter((n) => n.parent_acronym === acr).sort(cmp);

    return parents
      .map((parent) => {
        const children = kids(parent.acronym);
        const visible = match(parent) || children.some(match);
        // Merged figures: when a state has subdivisions, its national total is the sum of
        // those subdivisions, not the parent's own recorded value PLUS that sum — the parent
        // row and its subdivisions describe the same country, so adding both double-counts.
        // The parent's own value is only used as a fallback for a field no subdivision has
        // filed a figure for at all (e.g. a field the state tracks nationally but hasn't
        // broken out by subdivision).
        const merged: Nation = { ...parent };
        for (const key of ADDITIVE_FIELDS) {
          (merged as Record<string, unknown>)[key] = nationTotal(
            parent,
            nations,
            key as keyof Nation,
          );
        }
        return { parent, merged, children, visible };
      })
      .filter((g) => g.visible)
      .sort((a, b) => cmp(a.merged, b.merged));
  }, [nations, query, sortKey, asc]);

  // APE is a live-computed average of every real nation and subdivision, always shown first,
  // exempt from the normal sort order — it isn't "a country" competing on the same ranking.
  const apeRow = useMemo(() => {
    const ape = computeApe(nations);
    return { parent: ape, merged: ape, children: [] as Nation[], visible: true };
  }, [nations]);
  const groupsWithApe = [apeRow, ...groups];

  const rowCount = groupsWithApe.reduce((s, g) => s + 1 + g.children.length, 0);
  const shownColumns = COLUMNS.filter((c) => visibleColumns.has(c.key as string));

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggle(key: string) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  return (
    <BureauShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rule-label">Register · fiscal year {state.current_year}</div>
          <h1 className="text-3xl font-bold text-primary">National Accounts</h1>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search state or acronym…"
          className="w-64 rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="relative">
          <button
            onClick={() => setColumnPickerOpen((o) => !o)}
            className="rounded border border-border px-3 py-2 text-sm hover:border-primary"
          >
            Columns ({shownColumns.length}/{COLUMNS.length})
          </button>
          {columnPickerOpen && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-border bg-card p-2 shadow-lg">
              <p className="rule-label mb-2 px-1">Show columns</p>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key as string}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(c.key as string)}
                      onChange={() => toggleColumn(c.key as string)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <button
                onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
                className="mt-2 w-full rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
              >
                Reset to default
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded border border-border">
        <table className="min-w-max text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="w-8 px-1 py-2" aria-label="Flag" />
              <th
                className="rule-label cursor-pointer px-3 py-2 text-left"
                onClick={() => toggle("name")}
              >
                State
              </th>
              {shownColumns.map((c) => (
                <th
                  key={c.key as string}
                  className="rule-label cursor-pointer whitespace-nowrap px-3 py-2 text-right"
                  onClick={() => toggle(c.key as string)}
                >
                  {c.label}
                  {sortKey === c.key ? (asc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupsWithApe.map((g) => {
              const isApe = g.parent.acronym === "APE";
              const open = !!expanded[g.parent.acronym];
              const shown = open ? g.parent : g.merged;
              const isDropTarget = dropTarget?.acronym === g.parent.acronym;
              const isBeingDragged = draggedAcronym === g.parent.acronym;
              return (
                <Fragment key={g.parent.id}>
                  <tr
                    {...(isApe ? {} : rowDragProps(g.parent))}
                    className={`border-t border-border transition-colors ${
                      isDropTarget
                        ? "bg-blue-500/20 outline outline-2 outline-blue-500"
                        : "hover:bg-secondary/50"
                    } ${isBeingDragged ? "opacity-40" : ""} ${isGm && !isApe ? "cursor-grab" : ""} ${
                      busyAcronym === g.parent.acronym ? "opacity-50" : ""
                    } ${isApe ? "bg-secondary/30 font-medium" : ""}`}
                  >
                    <FlagCell nation={g.parent} />
                    <td
                      className="sticky left-8 z-10 max-w-[220px] truncate bg-card px-3 py-2"
                      title={`${g.parent.acronym} ${g.parent.name}`}
                    >
                      {g.children.length > 0 && (
                        <button
                          onClick={() => setExpanded({ ...expanded, [g.parent.acronym]: !open })}
                          className="mr-2 text-muted-foreground hover:text-primary"
                          aria-label={open ? "Collapse subdivisions" : "Expand subdivisions"}
                        >
                          {open ? "▾" : "▸"}
                        </button>
                      )}
                      {isApe ? (
                        <span
                          className="text-muted-foreground"
                          title="Live average across every registered nation and subdivision"
                        >
                          {g.parent.acronym} {g.parent.name}
                        </span>
                      ) : (
                        <Link
                          to="/nations/$acronym"
                          params={{ acronym: g.parent.acronym }}
                          className="hover:text-primary"
                        >
                          <span className="text-muted-foreground">{g.parent.acronym}</span>{" "}
                          {g.parent.name}
                        </Link>
                      )}
                    </td>
                    {shownColumns.map((c) => (
                      <td
                        key={c.key as string}
                        className={`tabular whitespace-nowrap px-3 py-2 text-right ${rowTone(c.key as string, shown as unknown as Record<string, unknown>)}`}
                      >
                        {isApe ? (
                          fmtValue(shown[c.key], c.format, cur)
                        ) : c.key === "credit_rating" ? (
                          <CreditTierFigure
                            nationId={g.parent.id}
                            tierId={g.parent.credit_tier_id}
                            tiers={creditTiers}
                          />
                        ) : open || g.children.length === 0 ? (
                          <EditableFigure
                            table="nations"
                            invalidateKey="nations"
                            id={g.parent.id}
                            field={c.key as string}
                            value={g.parent[c.key]}
                            format={c.format}
                            currency={cur}
                          />
                        ) : (
                          <>
                            <ModeGlyph
                              parent={g.parent}
                              nations={nations}
                              field={c.key as string}
                              collapsed={!open && g.children.length > 0}
                            />
                            {fmtValue(shown[c.key], c.format, cur)}
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                  {open &&
                    g.children.map((n) => {
                      const isChildDropTarget = dropTarget?.acronym === n.acronym;
                      const isChildDragged = draggedAcronym === n.acronym;
                      return (
                        <tr
                          key={n.id}
                          {...(isGm
                            ? {
                                ...rowDragProps(n),
                                onDragOver: (e: React.DragEvent) => {
                                  if (!draggedAcronym) return;
                                  e.preventDefault();
                                  // Dropping a subdivision onto its own sibling row detaches it
                                  // (released to sovereign), matching "drag out" behaviour even
                                  // without empty table space to drop onto.
                                  if (draggedAcronym === n.acronym) return;
                                  setDropTarget({ acronym: n.acronym, mode: "subordinate" });
                                },
                              }
                            : {})}
                          draggable={isGm}
                          onDragStart={(e) => {
                            if (!isGm) return;
                            e.dataTransfer.effectAllowed = "move";
                            setDraggedAcronym(n.acronym);
                          }}
                          onDragEnd={() => {
                            setDraggedAcronym(null);
                            setDropTarget(null);
                          }}
                          className={`border-t border-border/50 bg-background/40 transition-colors ${
                            isChildDropTarget
                              ? "bg-blue-500/20 outline outline-2 outline-blue-500"
                              : ""
                          } ${isChildDragged ? "opacity-40" : ""} ${isGm ? "cursor-grab" : ""} ${
                            busyAcronym === n.acronym ? "opacity-50" : ""
                          }`}
                        >
                          <FlagCell nation={n} />
                          <td
                            className="sticky left-8 z-10 flex max-w-[220px] items-center gap-1 bg-background/95 py-2 pl-8 pr-3"
                            title={`${n.acronym} ${n.name}`}
                          >
                            <Link
                              to="/nations/$acronym"
                              params={{ acronym: n.acronym }}
                              className="min-w-0 flex-1 truncate hover:text-primary"
                            >
                              <span className="text-muted-foreground">{n.acronym}</span> {n.name}
                            </Link>
                            {isGm && (
                              <button
                                onClick={() => void releaseSubdivision(n.acronym)}
                                disabled={busyAcronym === n.acronym}
                                className="shrink-0 rounded border border-green-600/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-green-600 hover:bg-green-600 hover:text-white disabled:opacity-50"
                                title="Release as a sovereign state"
                              >
                                Detach
                              </button>
                            )}
                          </td>
                          {shownColumns.map((c) => (
                            <td
                              key={c.key as string}
                              className={`tabular whitespace-nowrap px-3 py-2 text-right ${rowTone(c.key as string, n as unknown as Record<string, unknown>)}`}
                            >
                              {c.key === "credit_rating" ? (
                                <CreditTierFigure
                                  nationId={n.id}
                                  tierId={n.credit_tier_id}
                                  tiers={creditTiers}
                                />
                              ) : (
                                <EditableFigure
                                  table="nations"
                                  invalidateKey="nations"
                                  id={n.id}
                                  field={c.key as string}
                                  value={n[c.key]}
                                  format={c.format}
                                  currency={cur}
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {isGm && draggedAcronym && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              const dragged = nations.find((n) => n.acronym === draggedAcronym);
              if (dragged?.parent_acronym)
                setDropTarget({ acronym: draggedAcronym, mode: "release" });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedAcronym) void releaseSubdivision(draggedAcronym);
              setDraggedAcronym(null);
              setDropTarget(null);
            }}
            className={`m-2 rounded border-2 border-dashed p-3 text-center text-xs uppercase tracking-widest transition-colors ${
              dropTarget?.mode === "release"
                ? "border-green-500 bg-green-500/20 text-green-600"
                : "border-border text-muted-foreground"
            }`}
          >
            Drop here to release as a sovereign state
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {rowCount} registered entities. Subdivision figures are merged into their overlord until
        expanded. Blank cells indicate figures not yet filed with the Bureau.
        {isGm &&
          " Drag a state onto another to make it a subdivision; drag a subdivision onto the drop zone below the table to release it."}
      </p>
    </BureauShell>
  );
}

function FlagCell({ nation }: { nation: Nation }) {
  return (
    <td className="sticky left-0 z-10 w-8 bg-card px-1 py-2">
      {nation.flag_url ? (
        <img
          src={nation.flag_url}
          alt={`Flag of ${nation.name}`}
          className="h-4 w-6 border border-border object-cover"
        />
      ) : null}
    </td>
  );
}
