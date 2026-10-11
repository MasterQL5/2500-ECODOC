-- Fixes any "General debt" tranches created by the original migration, which stacked
-- base_interest_rate + credit_tiers.interest_markup (leading to absurdly high combined rates).
-- Rate is now purely the credit tier's markup — this corrects already-seeded tranches to match.
UPDATE public.debt_instruments d
SET interest_rate = COALESCE(t.interest_markup, n.base_interest_rate, 0.058)
FROM public.nations n
LEFT JOIN public.credit_tiers t ON t.id = n.credit_tier_id
WHERE d.nation_id = n.id AND d.is_general = true;
