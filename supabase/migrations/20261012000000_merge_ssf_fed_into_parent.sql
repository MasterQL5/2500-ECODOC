-- Make SSF work like Tataria / Angola: the parent row IS the core state ("SSF - FED" folded into
-- it) and the territories stay under it as subdivisions, combined with "own + subdivisions".
--
-- BACK UP FIRST (this deletes the 'SSF - FED' row). Safe to re-run: it does nothing once
-- 'SSF - FED' is gone. Rulings that mention 'SSF - FED' by name are left as written.
DO $$
DECLARE
  p_id uuid;
  f_id uuid;
  cols text;
BEGIN
  SELECT id INTO p_id FROM public.nations WHERE acronym = 'SSF' AND parent_acronym IS NULL;
  SELECT id INTO f_id FROM public.nations WHERE acronym = 'SSF - FED' AND parent_acronym = 'SSF';
  IF p_id IS NULL OR f_id IS NULL THEN
    RAISE NOTICE 'SSF or SSF - FED not found (already merged?): nothing to do.';
    RETURN;
  END IF;

  -- Archived years: the parent's old rows were whole-federation totals, the core's are the core's.
  -- Keep the core's history under the parent so "own + subdivisions" adds up for past years too.
  DELETE FROM public.year_snapshots WHERE kind = 'nation' AND ref_id = p_id
    AND EXISTS (SELECT 1 FROM public.year_snapshots s WHERE s.kind = 'nation' AND s.ref_id = f_id);
  UPDATE public.year_snapshots SET ref_id = p_id WHERE kind = 'nation' AND ref_id = f_id;

  -- Revenue formulas and debt: the core's replace the parent's, if the core has any.
  IF EXISTS (SELECT 1 FROM public.tax_formulas WHERE nation_id = f_id) THEN
    DELETE FROM public.tax_formulas WHERE nation_id = p_id;
    UPDATE public.tax_formulas SET nation_id = p_id WHERE nation_id = f_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.debt_instruments WHERE nation_id = f_id) THEN
    DELETE FROM public.debt_instruments WHERE nation_id = p_id;
    UPDATE public.debt_instruments SET nation_id = p_id WHERE nation_id = f_id;
  END IF;

  -- Every data column of the core goes onto the parent; identity and bookkeeping stay the parent's.
  SELECT string_agg(format('%1$I = f.%1$I', column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'nations'
    AND column_name NOT IN ('id', 'acronym', 'name', 'parent_acronym', 'sort_order',
                            'created_at', 'updated_at', 'fiscal');
  EXECUTE format(
    'UPDATE public.nations n SET %s FROM public.nations f WHERE n.id = %L AND f.id = %L',
    cols, p_id, f_id);

  -- Fiscal blob (expenditure categories, colours, ...) from the core, then the roll-up mode.
  UPDATE public.nations n
  SET fiscal = (COALESCE(f.fiscal, '{}'::jsonb) - '__rollup') || jsonb_build_object(
        '__rollup',
        '{"economy":"core_plus","population":"core_plus","finance":"core_plus","debt":"core_plus"}'::jsonb)
  FROM public.nations f
  WHERE n.id = p_id AND f.id = f_id;

  -- The core is gone as a separate state: its tables cascade away with it.
  DELETE FROM public.nations WHERE id = f_id;
END $$;
