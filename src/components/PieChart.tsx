import { useRef, useState } from "react";
import { fmtCompact } from "@/lib/econ";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";

export type PieSlice = {
  /** Stable id, shared with whatever list sits next to the chart so hovering either lights both. */
  key: string;
  /** What the slice is: an expenditure line, a revenue stream, or a whole category. */
  label: string;
  amount: number;
  color: string;
  /** Budget category the slice belongs to (expenditures only). */
  category?: string;
  /** Extra line under the label, e.g. "3 lines" when a slice stands for a whole category. */
  note?: string | undefined;
};

type Props = {
  slices: PieSlice[];
  currency: string;
  /** Text under the total in the middle of the chart. */
  centerLabel: string;
  /** What to call the slice's own name in the tooltip, e.g. "Expenditure" / "Revenue stream". */
  typeLabel: string;
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
  emptyText: string;
};

const SIZE = 220;
const C = SIZE / 2;
const R = 100;
const R_IN = 56;

function polar(r: number, angle: number): [number, number] {
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)];
}

function arcPath(a0: number, a1: number): string {
  // A slice that fills the whole disc can't be drawn as one arc, so draw it as two halves.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const [ox0, oy0] = polar(R, a0);
    const [ox1, oy1] = polar(R, a0 + Math.PI);
    const [ix0, iy0] = polar(R_IN, a0);
    const [ix1, iy1] = polar(R_IN, a0 + Math.PI);
    return (
      `M${ox0} ${oy0}A${R} ${R} 0 1 1 ${ox1} ${oy1}A${R} ${R} 0 1 1 ${ox0} ${oy0}Z` +
      `M${ix0} ${iy0}A${R_IN} ${R_IN} 0 1 0 ${ix1} ${iy1}A${R_IN} ${R_IN} 0 1 0 ${ix0} ${iy0}Z`
    );
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [ox0, oy0] = polar(R, a0);
  const [ox1, oy1] = polar(R, a1);
  const [ix1, iy1] = polar(R_IN, a1);
  const [ix0, iy0] = polar(R_IN, a0);
  return `M${ox0} ${oy0}A${R} ${R} 0 ${large} 1 ${ox1} ${oy1}L${ix1} ${iy1}A${R_IN} ${R_IN} 0 ${large} 0 ${ix0} ${iy0}Z`;
}

export function fmtShare(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const pct = fraction * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

/**
 * A donut chart drawn straight to SVG so it matches the rest of the sheet. Hovering a slice
 * raises it, dims the rest and shows a tooltip with its category, its own name, its amount and
 * its share of the whole. `activeKey` is controlled from outside so the lists beside the chart
 * can light the same slice (and the chart can light their rows).
 */
export function PieChart({
  slices,
  currency,
  centerLabel,
  typeLabel,
  activeKey,
  onActiveChange,
  emptyText,
}: Props) {
  useNumberDisplay(); // re-render when the short/full number toggle flips
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const drawn = slices.filter((s) => Number.isFinite(s.amount) && s.amount > 0);
  const total = drawn.reduce((s, x) => s + x.amount, 0);

  if (drawn.length === 0 || total <= 0) {
    return (
      <div className="flex aspect-square max-h-[260px] items-center justify-center rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const arcs = drawn.map((s) => {
    const sweep = (s.amount / total) * Math.PI * 2;
    const a0 = angle;
    angle += sweep;
    return { slice: s, a0, a1: angle, mid: (a0 + angle) / 2 };
  });

  const active = arcs.find((a) => a.slice.key === activeKey) ?? null;

  function track(e: React.MouseEvent, key: string) {
    const box = wrap.current?.getBoundingClientRect();
    if (box) setTip({ x: e.clientX - box.left, y: e.clientY - box.top });
    if (activeKey !== key) onActiveChange(key);
  }

  const boxW = wrap.current?.clientWidth ?? 0;
  const tipOnLeft = tip !== null && boxW > 0 && tip.x > boxW * 0.55;

  return (
    <div ref={wrap} className="relative mx-auto w-full max-w-[280px]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${centerLabel}: ${arcs
          .map((a) => `${a.slice.label} ${fmtShare(a.slice.amount / total)}`)
          .join(", ")}`}
        onMouseLeave={() => {
          setTip(null);
          onActiveChange(null);
        }}
      >
        {arcs.map(({ slice, a0, a1, mid }) => {
          const isActive = slice.key === activeKey;
          const dim = activeKey !== null && !isActive;
          const lift = isActive ? 6 : 0;
          return (
            <path
              key={slice.key}
              d={arcPath(a0, a1)}
              fill={slice.color}
              fillRule="evenodd"
              stroke="var(--card)"
              strokeWidth={isActive ? 0 : 1.5}
              opacity={dim ? 0.4 : 1}
              transform={`translate(${Math.cos(mid) * lift} ${Math.sin(mid) * lift})`}
              style={{
                transition: "opacity 120ms, transform 120ms",
                cursor: "pointer",
                filter: isActive ? `drop-shadow(0 0 6px ${slice.color}99)` : undefined,
              }}
              onMouseEnter={(e) => track(e, slice.key)}
              onMouseMove={(e) => track(e, slice.key)}
              onClick={() => onActiveChange(isActive ? null : slice.key)}
            />
          );
        })}
        <g className="pointer-events-none" textAnchor="middle">
          {active ? (
            <>
              <text
                x={C}
                y={C - 2}
                className="fill-foreground font-display"
                style={{ fontSize: 22, fontWeight: 700 }}
              >
                {fmtShare(active.slice.amount / total)}
              </text>
              <text
                x={C}
                y={C + 14}
                className="fill-muted-foreground"
                style={{ fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase" }}
              >
                {active.slice.label.length > 22
                  ? `${active.slice.label.slice(0, 21)}…`
                  : active.slice.label}
              </text>
            </>
          ) : (
            <>
              <text
                x={C}
                y={C - 2}
                className="fill-foreground font-display"
                style={{ fontSize: 17, fontWeight: 700 }}
              >
                {fmtCompact(total, currency)}
              </text>
              <text
                x={C}
                y={C + 14}
                className="fill-muted-foreground"
                style={{ fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase" }}
              >
                {centerLabel}
              </text>
            </>
          )}
        </g>
      </svg>

      {tip && active && (
        <div
          className="pointer-events-none absolute z-30 w-max max-w-[210px] rounded border border-border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{
            top: Math.max(0, tip.y - 12),
            ...(tipOnLeft ? { right: boxW - tip.x + 14 } : { left: tip.x + 14 }),
          }}
        >
          {active.slice.category && (
            <div className="rule-label mb-1 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: active.slice.color }}
              />
              {active.slice.category}
            </div>
          )}
          <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {typeLabel}
          </div>
          <div className="font-semibold text-foreground">{active.slice.label}</div>
          {active.slice.note && (
            <div className="text-[11px] text-muted-foreground">{active.slice.note}</div>
          )}
          <div className="tabular mt-1 flex items-baseline justify-between gap-4">
            <span>{fmtCompact(active.slice.amount, currency)}</span>
            <span className="font-bold text-primary">{fmtShare(active.slice.amount / total)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">of {centerLabel.toLowerCase()}</div>
        </div>
      )}
    </div>
  );
}
