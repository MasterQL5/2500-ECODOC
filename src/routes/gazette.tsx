import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BureauShell } from "@/components/BureauShell";
import { gameStateQuery, rulingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/gazette")({
  head: () => ({
    meta: [
      { title: "Gazette — Bureau of Interstellar Statistics" },
      { name: "description", content: "Official register of rulings, amendments and market events." },
      { property: "og:title", content: "Gazette — Bureau of Interstellar Statistics" },
      { property: "og:description", content: "Rulings and events affecting commodity prices and national accounts." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(rulingsQuery),
    ]);
  },
  component: GazettePage,
});

/** Renders a ruling body, tinting any percentage or arrow movement it mentions. */
function GazetteBody({ body }: { body: string }) {
  return (
    <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
      {body.split(/(\s)/).map((word, i) => {
        const m = word.match(/^([+-]?)([\d.,]+)(%|→)?$/);
        const rising = word.startsWith("+") || word.includes("▲");
        const falling = word.startsWith("-") || word.includes("▼");
        if (m && (rising || falling)) {
          return (
            <span key={i} className={rising ? "text-gain" : "text-loss"}>
              {word}
            </span>
          );
        }
        return <span key={i}>{word}</span>;
      })}
    </p>
  );
}

function GazettePage() {
  const { data: rulings } = useSuspenseQuery(rulingsQuery);

  return (
    <BureauShell>
      <div className="rule-label">Official record</div>
      <h1 className="mb-6 mt-2 text-3xl font-bold text-primary">The Gazette</h1>
      <div className="space-y-3">
        {rulings.length === 0 && (
          <p className="rounded border border-dashed border-border p-6 text-sm text-muted-foreground">
            No rulings entered on the register.
          </p>
        )}
        {rulings.map((r) => (
          <article key={r.id} className="rounded border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="rule-label">Year {r.year}</div>
              <span className="rule-label">{r.status}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-primary">{r.title}</h2>
            {r.body && <GazetteBody body={r.body} />}
          </article>
        ))}
      </div>
    </BureauShell>
  );
}
