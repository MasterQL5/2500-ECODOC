import type { DebtInstrument } from "./debt";
import { fmtCompact, type Nation } from "./econ";
import { expenditureLines, UNCATEGORISED } from "./fiscal";
import { buildContext, evalTokens, type TaxFormula } from "./formula";
import { withTaxBase } from "./rollup";

export type DebtLine = { id: string; label: string; amount: number; note?: string };

/** Debt shown by type: each tranche's yearly interest is its own line. With no tranches on file,
 * whatever debt lines the filed expenditures carry stand in. */
export function debtLines(
  instruments: DebtInstrument[],
  fallback: { label: string; amount: number }[],
  currency: string,
): DebtLine[] {
  if (instruments.length > 0) {
    return instruments.map((d) => ({
      id: `debt:${d.id}`,
      label: d.label,
      amount: d.defaulted ? 0 : d.principal * d.interest_rate,
      note: d.defaulted
        ? `in default · ${fmtCompact(d.principal, currency)} owed, no interest`
        : `${fmtCompact(d.principal, currency)} at ${(d.interest_rate * 100).toFixed(2)}%`,
    }));
  }
  return fallback.map((l) => ({ id: `locked:${l.label}`, label: l.label, amount: l.amount }));
}

export type BookLine = {
  id: string;
  label: string;
  amount: number;
  locked: boolean;
  note?: string;
};

/** One state's own revenue streams and expenditure lines, as the dossier would list them. */
export type MemberBooks = {
  nation: Nation;
  streams: { id: string; name: string; value: number }[];
  lines: BookLine[];
};

export function memberBooks(
  member: Nation,
  nations: Nation[],
  allTaxes: TaxFormula[],
  formula: Record<string, number>,
  allDebt: DebtInstrument[],
  currency: string,
): MemberBooks {
  const taxes = allTaxes.filter((t) => t.nation_id === member.id);
  const ctx = buildContext(withTaxBase(member, nations), formula, nations);
  const streams =
    taxes.length > 0
      ? taxes.map((t) => ({ id: t.id, name: t.name, value: evalTokens(t.tokens, ctx) }))
      : member.revenue
        ? [{ id: "registered", name: "Registered revenue", value: member.revenue }]
        : [];
  const revenue = streams.reduce((s, r) => s + r.value, 0);
  const lines = expenditureLines(member, revenue);
  const debt = debtLines(
    allDebt.filter((d) => d.nation_id === member.id),
    lines.filter((l) => l.locked),
    currency,
  );
  return {
    nation: member,
    streams,
    lines: [
      ...lines
        .filter((l) => !l.locked)
        .map((l, i) => ({
          id: `x${i}`,
          label: l.label,
          amount: l.amount,
          locked: l.foreign,
          ...(l.category !== UNCATEGORISED ? { note: l.category } : {}),
        })),
      ...debt.map((d) => ({ ...d, locked: true })),
    ],
  };
}
