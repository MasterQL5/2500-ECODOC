import { useState } from "react";
import { NumberField } from "@/components/NumberField";
import type { Nation } from "@/lib/econ";
import {
  FN_LABELS,
  FUNCTIONS,
  OPERATORS,
  OP_SYMBOLS,
  STAT_KEYS,
  STAT_LABELS,
  type FormulaContext,
  type FormulaToken,
} from "@/lib/formula";

export type NewTokenKind = "num" | "stat" | "xstat" | "fn" | "fiscal" | "op";

/** A fresh module of the given kind, with sensible starting values. */
export function newToken(
  kind: NewTokenKind,
  nations: Nation[],
  selfAcronym?: string,
): FormulaToken {
  switch (kind) {
    case "num":
      return { t: "num", v: 1 };
    case "stat":
      return { t: "stat", k: "gdp_nominal" };
    case "xstat":
      return {
        t: "xstat",
        n: (nations.find((n) => n.acronym !== selfAcronym) ?? nations[0])?.acronym ?? "",
        k: "gdp_nominal",
      };
    case "fn":
      return { t: "fn", v: "sqrt" };
    case "fiscal":
      return { t: "fiscal", k: "income_tax_rate" };
    default:
      return { t: "op", v: "*" };
  }
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
    >
      {label}
    </button>
  );
}

/** The row of "+ number / + statistic / …" buttons that append a module to a formula. */
export function FormulaAddButtons({ add }: { add: (kind: NewTokenKind) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <AddBtn label="+ number" onClick={() => add("num")} />
      <AddBtn label="+ statistic (domestic)" onClick={() => add("stat")} />
      <AddBtn label="+ statistic (international)" onClick={() => add("xstat")} />
      <AddBtn label="+ variable" onClick={() => add("fiscal")} />
      <AddBtn label="+ operator" onClick={() => add("op")} />
      <AddBtn label="+ function" onClick={() => add("fn")} />
    </div>
  );
}

/** A formula as a row of draggable modules. Hover a module to reveal ◀ ▶ buttons that move it;
 * notes grow downward as you type so long text is never cut off. */
export function FormulaBlocks({
  tokens,
  onChange,
  ctx,
  nations,
}: {
  tokens: FormulaToken[];
  onChange: (tokens: FormulaToken[]) => void;
  ctx: FormulaContext;
  nations: Nation[];
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const update = (i: number, tok: FormulaToken) =>
    onChange(tokens.map((x, j) => (j === i ? tok : x)));
  const remove = (i: number) => onChange(tokens.filter((_, j) => j !== i));
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= tokens.length) return;
    const next = [...tokens];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    onChange(next);
  };
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {tokens.map((tok, i) => (
        <div
          key={i}
          draggable
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag !== null) move(drag, i);
            setDrag(null);
          }}
          className={`group relative flex w-36 cursor-grab flex-col gap-1 rounded border p-1.5 text-xs ${
            tok.t === "op"
              ? "border-accent/50 bg-accent/10"
              : tok.t === "stat"
                ? "border-primary/50 bg-primary/10"
                : tok.t === "xstat"
                  ? "border-sky-500/50 bg-sky-500/10"
                  : tok.t === "fn"
                    ? "border-accent/50 bg-accent/10"
                    : tok.t === "fiscal"
                      ? "border-border bg-secondary"
                      : "border-border bg-background"
          }`}
          title="Drag to reorder"
        >
          <div className="pointer-events-none absolute -top-2.5 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            <button
              type="button"
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              className="rounded border border-border bg-card px-1.5 text-[11px] leading-4 text-muted-foreground shadow hover:border-primary hover:text-primary disabled:opacity-30"
              title="Move left"
              aria-label="Move module left"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => move(i, i + 1)}
              disabled={i === tokens.length - 1}
              className="rounded border border-border bg-card px-1.5 text-[11px] leading-4 text-muted-foreground shadow hover:border-primary hover:text-primary disabled:opacity-30"
              title="Move right"
              aria-label="Move module right"
            >
              ▶
            </button>
          </div>
          <div className="flex items-center gap-1">
            {tok.t === "num" && (
              <NumberField
                value={tok.v}
                onCommit={(v) => update(i, { ...tok, t: "num", v })}
                className="w-full rounded border border-border bg-background px-1 py-0.5 text-right text-xs"
              />
            )}
            {tok.t === "stat" && (
              <select
                value={tok.k}
                onChange={(e) =>
                  update(i, {
                    ...tok,
                    t: "stat",
                    k: e.target.value,
                  })
                }
                className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
              >
                {STAT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {STAT_LABELS[k]}
                  </option>
                ))}
              </select>
            )}
            {tok.t === "xstat" && (
              <div className="flex w-full flex-col gap-1">
                <select
                  value={tok.n}
                  onChange={(e) => update(i, { ...tok, n: e.target.value })}
                  className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                >
                  {nations.map((n) => (
                    <option key={n.id} value={n.acronym}>
                      {n.acronym} — {n.name}
                    </option>
                  ))}
                </select>
                <select
                  value={tok.k}
                  onChange={(e) => update(i, { ...tok, k: e.target.value })}
                  className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                >
                  {STAT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {STAT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tok.t === "fn" && (
              <select
                value={tok.v}
                onChange={(e) => update(i, { ...tok, v: e.target.value as never })}
                className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
              >
                {FUNCTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f} — {FN_LABELS[f]}
                  </option>
                ))}
              </select>
            )}
            {tok.t === "fiscal" && (
              <select
                value={tok.k}
                onChange={(e) =>
                  update(i, {
                    ...tok,
                    t: "fiscal",
                    k: e.target.value,
                  })
                }
                className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
              >
                {Object.keys(ctx.labels).map((k) => (
                  <option key={k} value={k}>
                    {ctx.labels[k]}
                  </option>
                ))}
              </select>
            )}
            {tok.t === "op" && (
              <select
                value={tok.v}
                onChange={(e) =>
                  update(i, {
                    ...tok,
                    t: "op",
                    v: e.target.value as never,
                  })
                }
                className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {OP_SYMBOLS[op]}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => remove(i)}
              className="text-muted-foreground hover:text-destructive"
              title="Remove module"
            >
              ×
            </button>
          </div>
          <textarea
            value={tok.d ?? ""}
            onChange={(e) => {
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
              update(i, { ...tok, d: e.target.value });
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            rows={1}
            placeholder="note…"
            className="w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded border border-border/60 bg-background/60 px-1 py-0.5 text-[10px] leading-snug text-muted-foreground"
          />
        </div>
      ))}
      {tokens.length === 0 && (
        <span className="text-xs text-muted-foreground">Empty formula — add modules.</span>
      )}
    </div>
  );
}
