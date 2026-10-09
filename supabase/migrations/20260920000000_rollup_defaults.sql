-- Seeds how known parent tags combine with their subdivisions (nation.fiscal.__rollup).
-- Modes: 'sum' (sum of subdivisions), 'core_plus' (own figure + subdivisions), 'own' (own only).
-- Only sets a value where none exists yet, and only for tags that exist, so it is safe to re-run
-- and will not overwrite a GM's choice. Tianxia's acronym isn't in the seed file: set it from the
-- GM page ("How subdivisions combine") or add its acronym to the first list below.
UPDATE public.nations SET fiscal = COALESCE(fiscal, '{}'::jsonb) ||
  jsonb_build_object('__rollup', '{"economy":"sum","population":"sum","finance":"sum"}'::jsonb)
WHERE acronym IN ('USA', 'SSF') AND NOT (COALESCE(fiscal, '{}'::jsonb) ? '__rollup');

UPDATE public.nations SET fiscal = COALESCE(fiscal, '{}'::jsonb) ||
  jsonb_build_object('__rollup', '{"economy":"sum","population":"sum","finance":"own"}'::jsonb)
WHERE acronym IN ('EUR', 'VMS') AND NOT (COALESCE(fiscal, '{}'::jsonb) ? '__rollup');

UPDATE public.nations SET fiscal = COALESCE(fiscal, '{}'::jsonb) ||
  jsonb_build_object('__rollup', '{"economy":"core_plus","population":"core_plus","finance":"core_plus"}'::jsonb)
WHERE acronym IN ('TAT', 'ANG', 'HBE') AND NOT (COALESCE(fiscal, '{}'::jsonb) ? '__rollup');
