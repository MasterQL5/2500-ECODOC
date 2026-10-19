import { createFileRoute } from "@tanstack/react-router";
import { BureauShell } from "@/components/BureauShell";
import { NationsRegister } from "@/components/NationsRegister";
import { creditTiersQuery, gameStateQuery, nationsQuery } from "@/lib/queries";

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
  return (
    <BureauShell>
      <NationsRegister />
    </BureauShell>
  );
}
