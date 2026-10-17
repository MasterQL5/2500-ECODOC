import { useState } from "react";
import { toast } from "sonner";
import { fmtCompact } from "@/lib/econ";
import { DEBT_CATEGORY } from "@/lib/fiscal";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { fmtShare } from "@/components/PieChart";

export type BoardRow = {
  id: string;
  label: string;
  amount: number;
  category: string;
  /** Debt lines: shown with their share, never editable. */
  locked: boolean;
  /** Small print under the name (debt lines: principal and rate). */
  note?: string;
  /** This line's own gradient, matching its slice when the pie is subdivided. */
  color: string;
};

export type BoardCategory = {
  name: string;
  color: string;
  rows: BoardRow[];
};

export type Hover = { cat: string | null; row: string | null };
export const NO_HOVER: Hover = { cat: null, row: null };

export type BoardActions = {
  /** Leave out changeRow / removeRow / addRow when the lines themselves are not the player's to
   * edit (revenue streams): the board then only lets them be regrouped. */
  changeRow?: (id: string, patch: { label?: string; amount?: number }) => void;
  removeRow?: (id: string) => void;
  addRow?: (category: string) => void;
  moveRow: (id: string, category: string) => void;
  /** Returns an error message when the new name can't be used. */
  renameCategory: (from: string, to: string) => string | null;
  recolor: (category: string, hex: string) => void;
  removeCategory: (category: string) => void;
  addCategory: () => void;
};

type Props = {
  categories: BoardCategory[];
  total: number;
  currency: string;
  hover: Hover;
  onHover: (h: Hover) => void;
  /** Present only while the visitor holds the access code. */
  actions?: BoardActions | undefined;
  /** Name of the bucket for lines without a category (it can be renamed but not deleted). */
  placeholderCategory: string;
};

/**
 * Expenditures laid out as one column per budget category, each holding that category's lines
 * stacked underneath, with every line's (and every category's) share of total spending. Everyone
 * sees the board; the controls only exist when `actions` is passed.
 */
export function ExpenditureBoard({
  categories,
  total,
  currency,
  hover,
  onHover,
  actions,
  placeholderCategory,
}: Props) {
  useNumberDisplay();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);
  const editable = !!actions;
  const moveTargets = categories
    .filter((c) => c.name !== DEBT_CATEGORY)
    .map((c) => c.name)
    .concat(categories.some((c) => c.name === placeholderCategory) ? [] : [placeholderCategory]);

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-3">
      {categories.map((cat) => {
        const sum = cat.rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
        const isDebt = cat.name === DEBT_CATEGORY;
        const colHot = hover.cat === cat.name && hover.row === null;
        return (
          <section
            key={cat.name}
            onDragOver={(e) => {
              if (!dragId || isDebt) return;
              e.preventDefault();
              if (overCat !== cat.name) setOverCat(cat.name);
            }}
            onDragLeave={() => setOverCat((c) => (c === cat.name ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && !isDebt) actions?.moveRow(dragId, cat.name);
              setDragId(null);
              setOverCat(null);
            }}
            className={`min-w-[14rem] flex-1 basis-[14rem] rounded border bg-background/40 transition-colors ${
              overCat === cat.name
                ? "border-primary bg-primary/10"
                : colHot
                  ? "border-foreground/40"
                  : "border-border"
            }`}
          >
            <header
              className="border-b border-border p-2.5"
              style={{ borderTop: `3px solid ${cat.color}` }}
              onMouseEnter={() => onHover({ cat: cat.name, row: null })}
              onMouseLeave={() => onHover(NO_HOVER)}
            >
              <div className="flex items-center gap-2">
                {editable ? (
                  <input
                    type="color"
                    value={cat.color}
                    onChange={(e) => actions.recolor(cat.name, e.target.value)}
                    title="Pick this category's colour"
                    aria-label={`Colour for ${cat.name}`}
                    className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                ) : (
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: cat.color }}
                  />
                )}
                {editable && !isDebt ? (
                  <CategoryName
                    name={cat.name}
                    onCommit={(to) => {
                      const err = actions.renameCategory(cat.name, to);
                      if (err) toast.error(err);
                    }}
                  />
                ) : (
                  <h3 className="min-w-0 flex-1 truncate font-display text-sm font-semibold">
                    {cat.name}
                    {isDebt && (
                      <span className="ml-1.5 text-xs text-muted-foreground" aria-hidden>
                        🔒
                      </span>
                    )}
                  </h3>
                )}
                {editable && !isDebt && cat.name !== placeholderCategory && (
                  <button
                    onClick={() => actions.removeCategory(cat.name)}
                    title="Delete this category (its lines move to Uncategorised)"
                    aria-label={`Delete category ${cat.name}`}
                    className="rounded border border-destructive/50 px-1.5 text-xs text-destructive"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="tabular mt-1.5 flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">{fmtCompact(sum, currency)}</span>
                <span className="font-semibold text-primary">
                  {total > 0 ? fmtShare(sum / total) : "—"}
                </span>
              </div>
            </header>

            <div className="space-y-1.5 p-2">
              {cat.rows.length === 0 && (
                <p className="rounded border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
                  No lines yet
                </p>
              )}
              {cat.rows.map((row) => {
                const hot =
                  hover.row === row.id ? "row" : hover.row === null && colHot ? "col" : null;
                return (
                  <div
                    key={row.id}
                    data-box
                    onMouseEnter={() => onHover({ cat: cat.name, row: row.id })}
                    onMouseLeave={() => onHover(NO_HOVER)}
                    className={`rounded border bg-card p-2 text-sm transition-colors ${
                      hot === "row"
                        ? "border-foreground/50 bg-secondary"
                        : hot === "col"
                          ? "border-border bg-secondary/40"
                          : "border-border/60"
                    } ${dragId === row.id ? "opacity-40" : ""} ${row.locked ? "bg-secondary/30" : ""}`}
                    style={{ borderLeft: `3px solid ${row.color}` }}
                    title={
                      row.locked
                        ? "Locked — derived from this state's debt instruments in the Formula Workbench's Debt & Credit tab"
                        : undefined
                    }
                  >
                    {editable && !row.locked ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              const box = (e.currentTarget as HTMLElement).closest("[data-box]");
                              if (box) e.dataTransfer.setDragImage(box, 12, 12);
                              setDragId(row.id);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setOverCat(null);
                            }}
                            className="cursor-grab select-none text-muted-foreground"
                            title="Drag to another category"
                          >
                            ⠿
                          </span>
                          {actions.changeRow ? (
                            <input
                              value={row.label}
                              onChange={(e) =>
                                actions.changeRow?.(row.id, { label: e.target.value })
                              }
                              aria-label="Expenditure name"
                              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
                            />
                          ) : (
                            <span className="min-w-0 flex-1 break-words">{row.label}</span>
                          )}
                          {actions.removeRow && (
                            <button
                              onClick={() => actions.removeRow?.(row.id)}
                              className="rounded border border-destructive/50 px-2 text-xs text-destructive"
                              aria-label="Remove expenditure"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {actions.changeRow ? (
                            <input
                              type="number"
                              step="any"
                              value={Number.isFinite(row.amount) ? row.amount : ""}
                              onChange={(e) =>
                                actions.changeRow?.(row.id, { amount: Number(e.target.value) })
                              }
                              aria-label="Amount"
                              className="tabular min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-right text-sm"
                            />
                          ) : (
                            <span className="tabular min-w-0 flex-1 text-right text-sm">
                              {fmtCompact(row.amount, currency)}
                            </span>
                          )}
                          <span className="tabular w-12 text-right text-xs font-semibold text-primary">
                            {total > 0 ? fmtShare(row.amount / total) : "—"}
                          </span>
                        </div>
                        <select
                          value={row.category}
                          onChange={(e) => actions.moveRow(row.id, e.target.value)}
                          aria-label="Category"
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                        >
                          {moveTargets.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`min-w-0 break-words ${row.locked ? "text-muted-foreground" : ""}`}
                        >
                          {row.label}
                          {row.locked && (
                            <span className="ml-1.5 text-xs" aria-hidden>
                              🔒
                            </span>
                          )}
                          {row.note && (
                            <span className="block text-[11px] text-muted-foreground/80">
                              {row.note}
                            </span>
                          )}
                        </span>
                        <span className="tabular shrink-0 text-right">
                          <span className="block">{fmtCompact(row.amount, currency)}</span>
                          <span className="block text-xs font-semibold text-primary">
                            {total > 0 ? fmtShare(row.amount / total) : "—"}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {editable && !isDebt && actions.addRow && (
                <button
                  onClick={() => actions.addRow?.(cat.name)}
                  className="w-full rounded border border-dashed border-primary/50 px-3 py-1 text-xs text-primary hover:bg-primary/10"
                >
                  + Add line
                </button>
              )}
            </div>
          </section>
        );
      })}

      {editable && (
        <button
          onClick={actions.addCategory}
          className="flex min-h-[7rem] w-[11rem] shrink-0 items-center justify-center rounded border border-dashed border-primary/50 px-3 text-sm text-primary hover:bg-primary/10"
        >
          + Add category
        </button>
      )}
    </div>
  );
}

/** A category name that is only committed on blur / Enter, so half-typed names never collide. */
function CategoryName({ name, onCommit }: { name: string; onCommit: (to: string) => void }) {
  const [text, setText] = useState(name);
  const [prev, setPrev] = useState(name);
  if (prev !== name) {
    setPrev(name);
    setText(name);
  }
  function commit() {
    const next = text.trim();
    if (next === name) {
      setText(name);
      return;
    }
    onCommit(next);
    setText(name); // the board re-renders with the new name if it was accepted
  }
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(name);
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label="Category name"
      maxLength={40}
      className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-display text-sm font-semibold"
    />
  );
}
