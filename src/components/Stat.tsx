export function Stat({
  label,
  value,
  tone = "",
  foot,
}: {
  label: string;
  value: string;
  tone?: string;
  foot?: string;
}) {
  return (
    <div className="rounded border border-border bg-card p-4">
      <div className="rule-label">{label}</div>
      <div className={`tabular text-xl font-bold ${tone}`}>{value}</div>
      {foot && (
        <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {foot}
        </div>
      )}
    </div>
  );
}
