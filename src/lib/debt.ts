export type CreditTier = {
  id: string;
  name: string;
  interest_markup: number;
  sort_order: number;
};

export type DebtInstrument = {
  id: string;
  nation_id: string;
  label: string;
  principal: number;
  interest_rate: number;
  is_general: boolean;
  credit_tier_name_at_issue: string | null;
  issued_year: number | null;
  notes: string | null;
  sort_order: number;
};

/** The rate a brand-new tranche of debt gets today: purely the nation's current credit tier's
 * markup. There is no separate "base rate" stacking on top — a tier's markup already represents
 * the nation's full borrowing cost at that credit standing (AAA = 1.5%, B = 5.8%, etc). Existing
 * tranches never recompute this — their rate was fixed the moment they were issued, exactly as
 * requested ("the interest on that specific debt stays the same even if your credit rating goes
 * up"). */
export function currentIssueRate(
  nation: { base_interest_rate?: number },
  tier: CreditTier | null | undefined,
): number {
  return tier?.interest_markup ?? nation.base_interest_rate ?? 0.058;
}

/** Total interest owed this year across every tranche of a nation's debt — this is what shows
 * up, locked, as the "Interest payments" expenditure line. */
export function totalInterestDue(instruments: DebtInstrument[]): number {
  return instruments.reduce((sum, d) => sum + d.principal * d.interest_rate, 0);
}

/**
 * Advance every debt tranche by one year: the general tranche compounds by its own rate (grows
 * automatically, "keeps accruing... forever unless a GM manually pays it down or issues a bond
 * for it"); named/specific tranches also compound at their own rate unless a GM has been paying
 * them down directly — either way, the principal grows by its own locked rate each year the same
 * way ordinary debt does, since nothing here has a fixed term/amortisation schedule (a GM can
 * still remove or resize a tranche by hand for a matured bond, etc).
 */
export function advanceDebtInstruments(instruments: DebtInstrument[]): DebtInstrument[] {
  return instruments.map((d) => ({ ...d, principal: d.principal * (1 + d.interest_rate) }));
}

/**
 * Apply a payment (positive) or shortfall (negative deficit, passed as a positive amount to
 * subtract) to a nation's debt tranches, general debt first — paying down the general pool
 * before any specific instrument, and growing the general pool first when there's a deficit to
 * absorb, since that's the ordinary undifferentiated debt a government actually draws on. If
 * there's no general tranche yet, one is implicitly created at the nation's current issue rate.
 */
export function applyToGeneralDebt(
  instruments: DebtInstrument[],
  amount: number, // positive = pay down debt, negative = add to debt
  fallbackRate: number,
): DebtInstrument[] {
  const generalIndex = instruments.findIndex((d) => d.is_general);
  if (generalIndex === -1) {
    if (amount >= 0) return instruments; // nothing to pay down, no general tranche to create
    return [
      ...instruments,
      {
        id: `pending-${Date.now()}`,
        nation_id: instruments[0]?.nation_id ?? "",
        label: "General debt",
        principal: -amount,
        interest_rate: fallbackRate,
        is_general: true,
        credit_tier_name_at_issue: null,
        issued_year: null,
        notes: null,
        sort_order: 0,
      },
    ];
  }
  return instruments.map((d, i) =>
    i === generalIndex ? { ...d, principal: Math.max(0, d.principal + amount) } : d,
  );
}
