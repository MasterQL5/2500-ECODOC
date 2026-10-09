-- A defaulted debt instrument keeps counting toward the nation's debt, but stops accruing
-- interest and stops contributing to the "Interest payments" expenditure line.
ALTER TABLE public.debt_instruments ADD COLUMN IF NOT EXISTS defaulted boolean NOT NULL DEFAULT false;
