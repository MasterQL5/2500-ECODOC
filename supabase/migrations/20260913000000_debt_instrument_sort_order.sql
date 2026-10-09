-- Lets a GM manually reorder debt tranches (drag-and-drop in the Debt & Credit tab) rather than
-- always seeing them in creation order. Existing rows are numbered by their current order so
-- nothing visibly jumps around the first time this runs.
ALTER TABLE public.debt_instruments ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY nation_id ORDER BY created_at) * 10 AS ord
  FROM public.debt_instruments
)
UPDATE public.debt_instruments d
SET sort_order = numbered.ord
FROM numbered
WHERE d.id = numbered.id;
