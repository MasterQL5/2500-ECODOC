import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import type { Nation } from "@/lib/econ";
import { amountTone, fmtCompact, fmtFull, fmtPct } from "@/lib/econ";
import {
  DEBT_CATEGORY,
  UNCATEGORISED,
  categoryColorsOf,
  revenueCategoriesOf,
  revenueCategoryColorsOf,
  expenditureLines,
  inflatesExpenditures,
  isReservedCategory,
} from "@/lib/fiscal";
import {
  buildContext,
  describeTokens,
  evalTokens,
  labelsFor,
  tokenVariables,
  visibleFieldsOf,
  type TaxFormula,
} from "@/lib/formula";
import { debtLines } from "@/lib/books";
import type { DebtInstrument } from "@/lib/debt";
import { rollupSettings, rolledValue, withTaxBase } from "@/lib/rollup";
import { DEBT_COLOR, NEUTRAL_COLOR, resolveCategoryColors, shadesOf } from "@/lib/chartColors";
import {
  setNationCustomVariables,
  setNationExpenditureItems,
  setNationRevenueCategories,
} from "@/lib/nation.functions";
import { useFiling } from "@/hooks/useFiling";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { Stat } from "@/components/Stat";
import { CumulativeBooks } from "@/components/CumulativeBooks";
import { PieChart, fmtShare, type PieSlice } from "@/components/PieChart";
import {
  ExpenditureBoard,
  NO_HOVER,
  type BoardActions,
  type BoardCategory,
  type Hover,
} from "@/components/ExpenditureBoard";
import type { NationAccess } from "@/components/NationAccess";

type DraftRow = { id: string; label: string; amount: number; category: string };
/** The unfiled working copy of the expenditure board. `cats` is the left-to-right column order. */
type Draft = {
  rows: DraftRow[];
  cats: string[];
  inflate: boolean;
  colors: Record<string, string>;
};

type PieMode = "category" | "subdivided";
const PIE_MODE_KEY = "sohbos:expenditure-pie-mode";

/** Keep `cats` honest: every row's category has a column, and the catch-all column disappears
 * once nothing is left in it. Columns the visitor created themselves stay even when empty. */
function normalise(d: Draft): Draft {
  const cats = d.cats.filter((c) => c !== UNCATEGORISED || d.rows.some((r) => r.category === c));
  for (const r of d.rows) if (!cats.includes(r.category)) cats.push(r.category);
  return { ...d, cats };
}

function OwnBooks({
  nation,
  nations,
  taxes,
  debtInstruments,
  formula,
  currency,
  access,
}: {
  nation: Nation;
  nations: Nation[];
  taxes: TaxFormula[];
  /** This state's debt tranches, one locked line each in the Debt category. */
  debtInstruments: DebtInstrument[];
  formula: Record<string, number>;
  currency: string;
  access: NationAccess;
}) {
  useNumberDisplay();
  const qc = useQueryClient();
  const saveExpenditures = useServerFn(setNationExpenditureItems);
  const saveRevenueCategories = useServerFn(setNationRevenueCategories);
  const saveVariables = useServerFn(setNationCustomVariables);
  const { busy, run } = useFiling();
  const editable = access.unlocked;

  // ---- Revenue: every stream the Bureau's formulas (or the registry) give this state ----------
  const ctx = buildContext(withTaxBase(nation, nations), formula, nations);
  const revenueStreams = useMemo(() => {
    if (taxes.length === 0) {
      return nation.revenue
        ? [{ id: "registered", name: "Registered revenue", value: nation.revenue, tax: null }]
        : [];
    }
    return taxes.map((tax) => ({
      id: tax.id,
      name: tax.name,
      value: evalTokens(tax.tokens, ctx),
      tax,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxes, nation, nations, formula]);
  const revenueTotal = revenueStreams.reduce((s, r) => s + r.value, 0);

  // ---- Expenditure: the filed lines, or the visitor's unfiled working copy ---------------------
  const lines = expenditureLines(nation, revenueTotal);
  // Debt is shown by type: each tranche's yearly interest is its own locked line.
  const lockedLines = debtLines(
    debtInstruments,
    lines.filter((l) => l.locked),
    currency,
  );
  const baseline = useMemo<Draft>(() => {
    const rows = lines
      .filter((l) => !l.locked)
      .map((l, i) => ({ id: `r${i}`, label: l.label, amount: l.amount, category: l.category }));
    const cats: string[] = [];
    for (const r of rows) if (!cats.includes(r.category)) cats.push(r.category);
    return {
      rows,
      cats,
      inflate: inflatesExpenditures(nation),
      colors: categoryColorsOf(nation),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nation.expenditure_items, nation.expenditures, nation.fiscal, revenueTotal]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const nextId = useRef(0);
  // Locking the books throws away anything not yet filed.
  useEffect(() => {
    if (!editable) setDraft(null);
  }, [editable]);
  const working: Draft = editable && draft ? draft : baseline;
  const dirty = editable && draft !== null;

  function edit(fn: (d: Draft) => Draft) {
    setDraft((prev) => normalise(fn(prev ?? baseline)));
  }

  const catNames = [...working.cats, ...(lockedLines.length > 0 ? [DEBT_CATEGORY] : [])];
  const catColors = resolveCategoryColors(catNames, working.colors, {
    [DEBT_CATEGORY]: DEBT_COLOR,
    [UNCATEGORISED]: NEUTRAL_COLOR,
  });

  const boardCategories: BoardCategory[] = useMemo(() => {
    const out: BoardCategory[] = working.cats.map((name) => {
      const rows = working.rows.filter((r) => r.category === name);
      const shades = shadesOf(catColors[name]!, rows.length);
      return {
        name,
        color: catColors[name]!,
        rows: rows.map((r, i) => ({ ...r, locked: false, color: shades[i]! })),
      };
    });
    if (lockedLines.length > 0) {
      const shades = shadesOf(catColors[DEBT_CATEGORY]!, lockedLines.length);
      out.push({
        name: DEBT_CATEGORY,
        color: catColors[DEBT_CATEGORY]!,
        rows: lockedLines.map((l, i) => ({
          id: l.id,
          label: l.label,
          amount: l.amount,
          category: DEBT_CATEGORY,
          locked: true,
          color: shades[i]!,
          ...(l.note ? { note: l.note } : {}),
        })),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    working,
    lockedLines.map((l) => `${l.id}:${l.amount}:${l.note}`).join("|"),
    JSON.stringify(catColors),
  ]);

  const expTotal = boardCategories.reduce(
    (s, c) => s + c.rows.reduce((t, r) => t + (Number.isFinite(r.amount) ? r.amount : 0), 0),
    0,
  );
  const net = revenueTotal - expTotal;

  // Revenue to GDP: against the GDP the register shows for this state (a parent's is its members'
  // combined GDP). A state with subdivisions uses the register's own roll-up of revenue.
  const hasMembers = nations.some((n) => n.parent_acronym === nation.acronym);
  const gdp = rolledValue(nation, nations, "gdp_nominal").value ?? nation.gdp_nominal;
  const revenueToGdp = hasMembers
    ? rolledValue(nation, nations, "revenue_gdp_ratio").value
    : gdp && gdp > 0
      ? revenueTotal / gdp
      : null;

  // ---- Revenue categories: the streams are the Bureau's, how this state groups them is its own ---
  type RevDraft = {
    assign: Record<string, string>;
    cats: string[];
    colors: Record<string, string>;
  };
  const revBaseline = useMemo<RevDraft>(() => {
    const saved = revenueCategoriesOf(nation);
    const assign: Record<string, string> = {};
    const cats: string[] = [];
    for (const r of revenueStreams) {
      if (saved[r.name]) assign[r.name] = saved[r.name]!;
      const c = assign[r.name] ?? UNCATEGORISED;
      if (!cats.includes(c)) cats.push(c);
    }
    return { assign, cats, colors: revenueCategoryColorsOf(nation) };
  }, [revenueStreams, nation]);
  const [revDraft, setRevDraft] = useState<RevDraft | null>(null);
  useEffect(() => {
    if (!editable) setRevDraft(null);
  }, [editable]);
  const revWorking: RevDraft = editable && revDraft ? revDraft : revBaseline;
  const revDirty = editable && revDraft !== null;
  const revCatOf = (name: string) => revWorking.assign[name] || UNCATEGORISED;
  function normaliseRev(d: RevDraft): RevDraft {
    const used = new Set(revenueStreams.map((r) => d.assign[r.name] || UNCATEGORISED));
    const cats = d.cats.filter((c) => c !== UNCATEGORISED || used.has(c));
    for (const c of used) if (!cats.includes(c)) cats.push(c);
    return { ...d, cats };
  }
  function editRev(fn: (d: RevDraft) => RevDraft) {
    setRevDraft((prev) => normaliseRev(fn(prev ?? revBaseline)));
  }
  const revCatNames = normaliseRev(revWorking).cats;
  const revCatColors = resolveCategoryColors(revCatNames, revWorking.colors, {
    [UNCATEGORISED]: NEUTRAL_COLOR,
  });
  const revBoard: BoardCategory[] = revCatNames.map((name) => {
    const inCat = revenueStreams.filter((r) => revCatOf(r.name) === name);
    const shades = shadesOf(revCatColors[name]!, inCat.length);
    return {
      name,
      color: revCatColors[name]!,
      rows: inCat.map((r, i) => ({
        id: r.id,
        label: r.name,
        amount: r.value,
        category: name,
        locked: false,
        color: shades[i]!,
        ...(r.tax?.source === "nation" ? { note: "Domestic source" } : {}),
      })),
    };
  });
  const revStreamColor = new Map(
    revBoard.flatMap((c) => c.rows.map((r) => [r.id, r.color] as const)),
  );
  const revHasCategory = revCatNames.some((c) => !isReservedCategory(c));
  const [revModeChoice, setRevModeChoice] = useState<PieMode | null>(null);
  const revMode: PieMode = revModeChoice ?? (revHasCategory ? "category" : "subdivided");
  const [revHover, setRevHover] = useState<Hover>(NO_HOVER);

  // ---- Pie chart state --------------------------------------------------------------------------
  const hasRealCategory = working.cats.some((c) => !isReservedCategory(c));
  const [modeChoice, setModeChoice] = useState<PieMode | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PIE_MODE_KEY);
      if (raw === "category" || raw === "subdivided") setModeChoice(raw);
    } catch {
      // storage unavailable — the default applies
    }
  }, []);
  const mode: PieMode = modeChoice ?? (hasRealCategory ? "category" : "subdivided");
  function chooseMode(m: PieMode) {
    setModeChoice(m);
    try {
      window.localStorage.setItem(PIE_MODE_KEY, m);
    } catch {
      // storage unavailable — still applies for this visit
    }
  }

  const [hover, setHover] = useState<Hover>(NO_HOVER);

  const expSlices: PieSlice[] =
    mode === "category"
      ? boardCategories.map((c) => ({
          key: `cat:${c.name}`,
          label: c.name,
          amount: c.rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0),
          color: c.color,
          note: `${c.rows.length} line${c.rows.length === 1 ? "" : "s"}`,
        }))
      : boardCategories.flatMap((c) =>
          c.rows.map((r) => ({
            key: r.id,
            label: r.label || "Unnamed line",
            amount: r.amount,
            color: r.color,
            category: c.name,
          })),
        );
  const expActive = mode === "category" ? (hover.cat ? `cat:${hover.cat}` : null) : hover.row;
  function onExpActive(key: string | null) {
    if (key === null) return setHover(NO_HOVER);
    if (key.startsWith("cat:") && mode === "category") {
      return setHover({ cat: key.slice(4), row: null });
    }
    const cat = boardCategories.find((c) => c.rows.some((r) => r.id === key));
    setHover({ cat: cat?.name ?? null, row: key });
  }

  const revSlices: PieSlice[] =
    revMode === "category"
      ? revBoard.map((c) => ({
          key: `cat:${c.name}`,
          label: c.name,
          amount: c.rows.reduce((s, r) => s + r.amount, 0),
          color: c.color,
          note: `${c.rows.length} line${c.rows.length === 1 ? "" : "s"}`,
        }))
      : revBoard.flatMap((c) =>
          c.rows.map((r) => ({
            key: r.id,
            label: r.label,
            amount: r.amount,
            color: r.color,
            category: c.name,
            ...(r.note ? { note: r.note } : {}),
          })),
        );
  const revActive =
    revMode === "category" ? (revHover.cat ? `cat:${revHover.cat}` : null) : revHover.row;
  function onRevActive(key: string | null) {
    if (key === null) return setRevHover(NO_HOVER);
    if (key.startsWith("cat:") && revMode === "category") {
      return setRevHover({ cat: key.slice(4), row: null });
    }
    const cat = revBoard.find((c) => c.rows.some((r) => r.id === key));
    setRevHover({ cat: cat?.name ?? null, row: key });
  }

  const revActions: BoardActions | undefined = editable
    ? {
        moveRow: (id, category) =>
          editRev((d) => {
            const stream = revenueStreams.find((r) => r.id === id);
            if (!stream) return d;
            const assign = { ...d.assign };
            if (category === UNCATEGORISED) delete assign[stream.name];
            else assign[stream.name] = category;
            return {
              ...d,
              assign,
              cats: d.cats.includes(category) ? d.cats : [...d.cats, category],
            };
          }),
        renameCategory: (from, to) => {
          if (!to) return "A category needs a name";
          if (isReservedCategory(to) && to.toLowerCase() !== from.toLowerCase()) {
            return `"${to}" is reserved`;
          }
          if (revCatNames.some((c) => c !== from && c.toLowerCase() === to.toLowerCase())) {
            return `There is already a category called "${to}"`;
          }
          editRev((d) => {
            const colors = { ...d.colors };
            if (revCatColors[from]) colors[to] = revCatColors[from]!;
            delete colors[from];
            const assign: Record<string, string> = {};
            for (const r of revenueStreams) {
              const c = d.assign[r.name] || UNCATEGORISED;
              const next = c === from ? to : c;
              if (next !== UNCATEGORISED) assign[r.name] = next;
            }
            return { assign, cats: d.cats.map((c) => (c === from ? to : c)), colors };
          });
          return null;
        },
        recolor: (category, hex) =>
          editRev((d) => {
            const colors = { ...d.colors };
            for (const c of d.cats) colors[c] ??= revCatColors[c]!;
            colors[category] = hex;
            return { ...d, colors };
          }),
        removeCategory: (category) =>
          editRev((d) => {
            const assign = { ...d.assign };
            for (const r of revenueStreams) if (assign[r.name] === category) delete assign[r.name];
            return { ...d, assign, cats: d.cats.filter((c) => c !== category) };
          }),
        addCategory: () =>
          editRev((d) => {
            let n = 1;
            const taken = (name: string) =>
              d.cats.some((c) => c.toLowerCase() === name.toLowerCase());
            while (taken(`New category ${n}`)) n++;
            return { ...d, cats: [...d.cats, `New category ${n}`] };
          }),
      }
    : undefined;

  const commitRevenueCategories = () =>
    run(async () => {
      const assignments: Record<string, string> = {};
      for (const r of revenueStreams) {
        const c = revCatOf(r.name);
        if (c !== UNCATEGORISED) assignments[r.name] = c;
      }
      const colors = Object.fromEntries(revCatNames.map((c) => [c, revCatColors[c]!] as const));
      await saveRevenueCategories({
        data: { acronym: nation.acronym, code: access.code, assignments, colors },
      });
      await qc.invalidateQueries({ queryKey: ["nations"] });
      setRevDraft(null);
    }, "Revenue categories filed");

  // ---- Board actions (only handed out once the visitor has unlocked the books) ------------------
  const actions: BoardActions | undefined = editable
    ? {
        changeRow: (id, patch) =>
          edit((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
        removeRow: (id) => edit((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) })),
        addRow: (category) =>
          edit((d) => ({
            ...d,
            rows: [
              ...d.rows,
              { id: `n${nextId.current++}`, label: "New expenditure", amount: 0, category },
            ],
          })),
        moveRow: (id, category) =>
          edit((d) => ({
            ...d,
            cats: d.cats.includes(category) ? d.cats : [...d.cats, category],
            rows: d.rows.map((r) => (r.id === id ? { ...r, category } : r)),
          })),
        renameCategory: (from, to) => {
          if (!to) return "A category needs a name";
          if (isReservedCategory(to) && to.toLowerCase() !== from.toLowerCase()) {
            return `"${to}" is reserved`;
          }
          if (working.cats.some((c) => c !== from && c.toLowerCase() === to.toLowerCase())) {
            return `There is already a category called "${to}"`;
          }
          edit((d) => {
            const colors = { ...d.colors };
            const color = catColors[from];
            if (color) colors[to] = color;
            delete colors[from];
            return {
              ...d,
              cats: d.cats.map((c) => (c === from ? to : c)),
              rows: d.rows.map((r) => (r.category === from ? { ...r, category: to } : r)),
              colors,
            };
          });
          return null;
        },
        recolor: (category, hex) =>
          edit((d) => ({ ...d, colors: { ...catColorsFor(d, catColors), [category]: hex } })),
        removeCategory: (category) =>
          edit((d) => ({
            ...d,
            cats: d.cats.filter((c) => c !== category),
            rows: d.rows.map((r) =>
              r.category === category ? { ...r, category: UNCATEGORISED } : r,
            ),
          })),
        addCategory: () =>
          edit((d) => {
            let n = 1;
            const taken = (name: string) =>
              d.cats.some((c) => c.toLowerCase() === name.toLowerCase());
            while (taken(`New category ${n}`)) n++;
            return { ...d, cats: [...d.cats, `New category ${n}`] };
          }),
      }
    : undefined;

  const commitExpenditures = () =>
    run(async () => {
      const order = new Map(working.cats.map((c, i) => [c, i]));
      const items = [...working.rows]
        .sort((a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0))
        .map((r) => ({ label: r.label, amount: r.amount, category: r.category }));
      const colors = Object.fromEntries(catNames.map((c) => [c, catColors[c]!] as const));
      await saveExpenditures({
        data: {
          acronym: nation.acronym,
          code: access.code,
          items,
          inflate: working.inflate,
          colors,
        },
      });
      await qc.invalidateQueries({ queryKey: ["nations"] });
      setDraft(null);
    }, "Estimates filed");

  const legend = boardCategories.map((c) => ({
    name: c.name,
    color: c.color,
    amount: c.rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total revenue"
          value={fmtCompact(revenueTotal, currency)}
          tone="text-gain"
          foot={
            taxes.length > 0
              ? `${taxes.length} filed revenue formulas`
              : "No formulas filed — registered figure shown"
          }
        />
        <Stat label="Total expenditure" value={fmtCompact(expTotal, currency)} tone="text-loss" />
        <Stat
          label={net >= 0 ? "Net surplus" : "Net deficit"}
          value={fmtCompact(net, currency)}
          tone={amountTone(net)}
        />
        <Stat
          label="Revenue to GDP"
          value={revenueToGdp === null ? "—" : fmtPct(revenueToGdp)}
          foot={gdp ? `of ${fmtCompact(gdp, currency)} nominal GDP` : "No GDP filed"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="rule-label">Revenue streams</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Every revenue line filed for this state, and its share of total revenue.
              </p>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Revenue pie chart detail">
              {(
                [
                  ["category", "By category"],
                  ["subdivided", "Subdivided"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={revMode === m}
                  onClick={() => setRevModeChoice(m)}
                  className={`rule-label rounded border px-2.5 py-1 ${
                    revMode === m
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <PieChart
              slices={revSlices}
              currency={currency}
              centerLabel="Total revenue"
              typeLabel={revMode === "category" ? "Revenue category" : "Revenue stream"}
              activeKey={revActive}
              onActiveChange={onRevActive}
              emptyText="No revenue streams filed yet."
            />
          </div>
          <RevenueList
            streams={revenueStreams}
            colors={revenueStreams.map((r) => revStreamColor.get(r.id) ?? NEUTRAL_COLOR)}
            total={revenueTotal}
            ctx={ctx}
            currency={currency}
            hover={revHover.row}
            onHover={(id) =>
              setRevHover(
                id === null
                  ? NO_HOVER
                  : { cat: revCatOf(revenueStreams.find((r) => r.id === id)?.name ?? ""), row: id },
              )
            }
            exposed={visibleFieldsOf(nation)}
            editable={editable}
            busy={busy}
            onRate={(key, value) =>
              run(async () => {
                await saveVariables({
                  data: { acronym: nation.acronym, code: access.code, values: { [key]: value } },
                });
                await qc.invalidateQueries({ queryKey: ["nations"] });
              }, "Rate filed — revenue updated")
            }
          />
          <p className="mt-3 rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
            Revenue lines and their formulas are set by the Bureau. Petition a game-master to add or
            strike a tax.
          </p>
        </section>

        <section className="rounded border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="rule-label">Expenditure</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Debt service is always included and always locked.
              </p>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Pie chart detail">
              {(
                [
                  ["category", "By category"],
                  ["subdivided", "Subdivided"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => chooseMode(m)}
                  className={`rule-label rounded border px-2.5 py-1 ${
                    mode === m
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <PieChart
              slices={expSlices}
              currency={currency}
              centerLabel="Total expenditure"
              typeLabel={mode === "category" ? "Budget category" : "Expenditure line"}
              activeKey={expActive}
              onActiveChange={onExpActive}
              emptyText="No expenditure lines filed yet."
            />
          </div>
          <ul className="mt-3 space-y-0.5 text-sm">
            {legend.map((c) => (
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
                  <span className="mr-3">{fmtCompact(c.amount, currency)}</span>
                  <span className="font-semibold text-primary">
                    {expTotal > 0 ? fmtShare(c.amount / expTotal) : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {revenueStreams.length > 0 && (
        <section
          className={`rounded border bg-card p-4 ${editable ? "border-primary/40" : "border-border"}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="rule-label">Treasury books — revenue by category</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {editable
                  ? "Group the Bureau's revenue streams into categories of your own: drag ⠿ (or use the dropdown) to move a stream, rename and recolour categories. The streams and their amounts stay with the Bureau. Nothing is filed until you press “File revenue categories”."
                  : "Each column is a revenue category with its streams underneath. Enter the access code above to regroup them."}
              </p>
            </div>
            {revDirty && (
              <span className="rounded border border-primary/50 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                Unfiled changes — charts show the draft
              </span>
            )}
          </div>
          <div className="mt-3">
            <ExpenditureBoard
              categories={revBoard}
              total={revenueTotal}
              currency={currency}
              hover={revHover}
              onHover={setRevHover}
              actions={revActions}
              placeholderCategory={UNCATEGORISED}
            />
          </div>
          {editable && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={commitRevenueCategories}
                disabled={busy || !revDirty}
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                File revenue categories
              </button>
              {revDirty && (
                <button
                  onClick={() => setRevDraft(null)}
                  disabled={busy}
                  className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  Discard changes
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <section
        className={`rounded border bg-card p-4 ${editable ? "border-primary/40" : "border-border"}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="rule-label">Treasury books — expenditures by category</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {editable
                ? "Rename, revalue and recolour lines and categories; drag ⠿ (or use the dropdown) to move a line between categories. Nothing is filed until you press “File estimates”."
                : "Each column is a budget category with its lines underneath. Enter the access code above to amend this state's books."}
            </p>
          </div>
          {dirty && (
            <span className="rounded border border-primary/50 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
              Unfiled changes — charts show the draft
            </span>
          )}
        </div>
        <div className="mt-3">
          <ExpenditureBoard
            categories={boardCategories}
            total={expTotal}
            currency={currency}
            hover={hover}
            onHover={setHover}
            actions={actions}
            placeholderCategory={UNCATEGORISED}
          />
        </div>

        {editable ? (
          <>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={working.inflate}
                onChange={(e) => edit((d) => ({ ...d, inflate: e.target.checked }))}
              />
              <span>Automatically adjust expenditures for inflation</span>
            </label>
            <p className="ml-6 text-[11px] text-muted-foreground">
              On each year advance every line above rises or falls by this state's inflation rate.
              The interest and debt-service lines are locked: they follow the debt register, never
              inflation, and cannot be edited here.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={commitExpenditures}
                disabled={busy}
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                File estimates
              </button>
              {dirty && (
                <button
                  onClick={() => setDraft(null)}
                  disabled={busy}
                  className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  Discard changes
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Expenditures {working.inflate ? "are" : "are not"} adjusted for inflation on each year
            advance. Debt lines are locked and follow the debt register.
          </p>
        )}
      </section>

      <BureauVariables nation={nation} access={access} />
    </div>
  );
}

/** The colours as they currently look, so a single pick freezes the rest of the defaults too. */
function catColorsFor(d: Draft, shown: Record<string, string>): Record<string, string> {
  const out = { ...d.colors };
  for (const c of d.cats) out[c] ??= shown[c]!;
  return out;
}

function RevenueList({
  streams,
  colors,
  total,
  ctx,
  currency,
  hover,
  onHover,
  exposed,
  editable,
  busy,
  onRate,
}: {
  streams: { id: string; name: string; value: number; tax: TaxFormula | null }[];
  colors: string[];
  total: number;
  ctx: ReturnType<typeof buildContext>;
  currency: string;
  hover: string | null;
  onHover: (id: string | null) => void;
  /** Variables the Bureau has opened to the state; only these can be revised from here. */
  exposed: Set<string>;
  editable: boolean;
  busy: boolean;
  onRate: (key: string, value: number) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="mt-3 rounded border border-border p-2">
      <h3 className="rule-label mb-1">Select a line to inspect its formula and Bureau variables</h3>
      {streams.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">No revenue lines on file.</p>
      )}
      {streams.map((s, i) => {
        const open = openId === s.id;
        const vars = s.tax ? tokenVariables(s.tax.tokens, ctx) : [];
        // The tax's rates: the rate variables its formula reads. Those the Bureau has opened to
        // the state are revisable here (once unlocked); the rest are shown for reference.
        const rates = vars.filter(
          (v) => v.kind === "fiscal" && (exposed.has(v.key) || isRateKey(v.key)),
        );
        return (
          <div
            key={s.id}
            onMouseEnter={() => onHover(s.id)}
            onMouseLeave={() => onHover(null)}
            className={`border-b border-border/50 last:border-b-0 ${hover === s.id ? "bg-secondary/60" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-x-3">
              <button
                onClick={() => s.tax && setOpenId(open ? null : s.id)}
                className={`flex min-w-[16rem] flex-1 items-center justify-between gap-3 py-1 text-left text-sm ${
                  s.tax ? "hover:text-primary" : "cursor-default"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: colors[i] }}
                  />
                  <span className="truncate">
                    {s.tax ? (open ? "▾ " : "▸ ") : ""}
                    {s.name}
                  </span>
                  {s.tax?.source === "nation" && (
                    <span className="shrink-0 rounded border border-accent/50 px-1 text-[10px] uppercase tracking-wider text-accent">
                      domestic
                    </span>
                  )}
                </span>
                <span className="tabular shrink-0">
                  <span className="mr-3">{fmtCompact(s.value, currency)}</span>
                  <span className="font-semibold text-primary">
                    {total > 0 ? fmtShare(s.value / total) : "—"}
                  </span>
                </span>
              </button>
              {rates.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {rates.map((v) => (
                    <RateCell
                      key={v.key}
                      label={v.label}
                      varKey={v.key}
                      value={v.value}
                      canEdit={editable && exposed.has(v.key)}
                      busy={busy}
                      onCommit={onRate}
                    />
                  ))}
                </div>
              )}
            </div>
            {open && s.tax && (
              <div className="mb-2 space-y-2 rounded border border-border/60 bg-background/40 p-2 text-xs">
                <div>
                  <div className="rule-label mb-1">Revenue logic (set by the Bureau)</div>
                  <p className="text-muted-foreground">{describeTokens(s.tax.tokens, ctx)}</p>
                  <p className="tabular mt-1 text-foreground">= {fmtCompact(s.value, currency)}</p>
                </div>
                {vars.length > 0 && (
                  <div>
                    <div className="rule-label mb-1">Variables used by this tax (read only)</div>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                      {vars.map((v) => (
                        <div
                          key={`${v.kind}:${v.key}`}
                          className="flex justify-between border-b border-border/40 py-0.5"
                        >
                          <span className="text-muted-foreground">{v.label}</span>
                          <span className="tabular">{fmtFull(v.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A variable counts as a rate when its key says so; rates are shown and typed as percentages. */
const isRateKey = (key: string) => /rate/i.test(key);

/** One rate (or other exposed variable) shown beside the tax that reads it. Revisable in place
 * when the state is unlocked and the Bureau has opened that variable; commits on Enter or blur. */
function RateCell({
  label,
  varKey,
  value,
  canEdit,
  busy,
  onCommit,
}: {
  label: string;
  varKey: string;
  value: number;
  canEdit: boolean;
  busy: boolean;
  onCommit: (key: string, value: number) => void;
}) {
  const pct = isRateKey(varKey);
  const [text, setText] = useState<string | null>(null);
  const shown = pct ? Number((value * 100).toPrecision(6)) : value;

  const commit = () => {
    if (text === null) return;
    const n = Number(text);
    setText(null);
    if (text.trim() === "" || !Number.isFinite(n)) return;
    const next = pct ? n / 100 : n;
    if (Math.abs(next - value) < 1e-12) return;
    if (pct && (next < 0 || next > 1)) {
      toast.error("A rate must be between 0% and 100%");
      return;
    }
    onCommit(varKey, next);
  };

  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title={label}>
      <span className="max-w-[10rem] truncate">{label}</span>
      {canEdit ? (
        <input
          type="number"
          step="any"
          disabled={busy}
          value={text ?? String(shown)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setText(null);
          }}
          className="tabular w-20 rounded border border-primary/50 bg-background px-1.5 py-0.5 text-right text-xs text-foreground disabled:opacity-50"
        />
      ) : (
        <span className="tabular text-foreground">
          {pct ? Number(shown.toFixed(2)) : fmtFull(value)}
        </span>
      )}
      {pct && <span>%</span>}
    </label>
  );
}

/** The variables the Bureau has exposed for this state: readable by anyone, revisable with the code. */
function BureauVariables({ nation, access }: { nation: Nation; access: NationAccess }) {
  const qc = useQueryClient();
  const save = useServerFn(setNationCustomVariables);
  const { busy, run } = useFiling();
  const [draft, setDraft] = useState<Record<string, number>>({});

  const labels = labelsFor(nation);
  const vars = Array.from(visibleFieldsOf(nation)).map((key) => ({
    key,
    label: labels[key] ?? key.replace(/_/g, " "),
  }));
  if (vars.length === 0) return null;
  const fiscal = (nation.fiscal ?? {}) as Record<string, number>;

  const commit = () =>
    run(async () => {
      await save({ data: { acronym: nation.acronym, code: access.code, values: draft } });
      await qc.invalidateQueries({ queryKey: ["nations"] });
      setDraft({});
    }, "Variables filed");

  return (
    <section className="rounded border border-border bg-card p-4">
      <h2 className="rule-label mb-2">Bureau variables for {nation.name}</h2>
      <p className="mb-3 text-[11px] text-muted-foreground">
        These variables were added by the Bureau in the formula workbench and feed directly into
        this state's revenue formulas.{" "}
        {access.unlocked
          ? "Values may be revised here; removing a variable entirely is done from the formula workbench's Variables tab."
          : "Enter the access code above to revise them."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vars.map((v) => (
          <label key={v.key} className="block text-sm">
            <span className="rule-label">{v.label}</span>
            {access.unlocked ? (
              <input
                type="number"
                step="any"
                value={String(draft[v.key] ?? fiscal[v.key] ?? 0)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDraft((d) => ({ ...d, [v.key]: Number.isFinite(val) ? val : 0 }));
                }}
                className="tabular mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              />
            ) : (
              <div className="tabular mt-1 border-b border-border/60 py-1 font-medium">
                {fmtFull(Number(fiscal[v.key] ?? 0))}
              </div>
            )}
          </label>
        ))}
      </div>
      {access.unlocked && (
        <button
          onClick={commit}
          disabled={busy || Object.keys(draft).length === 0}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          File variable values
        </button>
      )}
    </section>
  );
}

type FiscalProps = {
  nation: Nation;
  nations: Nation[];
  allTaxes: TaxFormula[];
  allDebtInstruments: DebtInstrument[];
  formula: Record<string, number>;
  currency: string;
  access: NationAccess;
};

/**
 * The fiscal tab. A state that keeps its own books ("own", or no subdivisions) gets the editable
 * treasury books. A parent whose finances are rolled up from its subdivisions shows the
 * cumulative of those instead, grouped by the state each figure comes from; "own + subdivisions"
 * shows both. It all follows the roll-up setting live, so changing it in the Bureau's roll-up
 * panel changes this tab with no further step.
 */
export function FiscalAccounts({
  nation,
  nations,
  allTaxes,
  allDebtInstruments,
  formula,
  currency,
  access,
}: FiscalProps) {
  const hasMembers = nations.some((n) => n.parent_acronym === nation.acronym);
  const mode = hasMembers ? rollupSettings(nation).finance : "own";
  const [merged, setMerged] = useState(false);
  const own = (
    <OwnBooks
      nation={nation}
      nations={nations}
      taxes={allTaxes.filter((t) => t.nation_id === nation.id)}
      debtInstruments={allDebtInstruments.filter((d) => d.nation_id === nation.id)}
      formula={formula}
      currency={currency}
      access={access}
    />
  );
  if (mode === "own") return own;
  return (
    <div className="space-y-6">
      <CumulativeBooks
        nation={nation}
        nations={nations}
        mode={mode}
        allTaxes={allTaxes}
        allDebt={allDebtInstruments}
        formula={formula}
        currency={currency}
        onMerged={setMerged}
      />
      {mode === "core_plus" && !merged && (
        <div>
          <h2 className="mb-1 text-xl font-bold">{nation.name} — own books</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {nation.name}'s own revenue and expenditure, counted in the cumulative figures above.
          </p>
          {own}
        </div>
      )}
    </div>
  );
}
