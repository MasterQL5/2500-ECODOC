import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BureauShell } from "@/components/BureauShell";
import { AtlasMaps } from "@/components/AtlasMaps";
import { gameStateQuery, nationsQuery } from "@/lib/queries";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Atlas — Bureau of Interstellar Statistics" },
      {
        name: "description",
        content: "Interactive atlas of registered states and their accounts.",
      },
      { property: "og:title", content: "Atlas — Bureau of Interstellar Statistics" },
      {
        property: "og:description",
        content: "Click a state on the map to read its national accounts.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(nationsQuery),
    ]);
  },
  component: AtlasPage,
});

function AtlasPage() {
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { data: nations } = useSuspenseQuery(nationsQuery);
  const cur = state.currency_code === "TRI" ? "▲" : "C$";

  return (
    <BureauShell>
      <div className="rule-label">Cartographic section</div>
      <h1 className="mb-6 mt-2 text-3xl font-bold text-primary">Atlas of registered states</h1>
      <AtlasMaps nations={nations} currency={cur} />
    </BureauShell>
  );
}
