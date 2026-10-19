-- ECODOC formula presets: the table the Formula Workbench saves to and imports from.
-- Run once in the Supabase SQL editor. Safe to re-run, and safe if an older version of the
-- table already exists (it only adds what is missing).

CREATE TABLE IF NOT EXISTS public.formula_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  brackets jsonb not null default '[]'::jsonb,
  variables jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- For databases that already have the original table (no variables column yet).
ALTER TABLE public.formula_presets ADD COLUMN IF NOT EXISTS variables jsonb NOT NULL DEFAULT '[]'::jsonb;

GRANT SELECT ON public.formula_presets TO anon;
-- Row-level security alone is not enough: the signed-in GM also needs table-level write privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formula_presets TO authenticated;
GRANT ALL ON public.formula_presets TO service_role;

ALTER TABLE public.formula_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "formula presets public read" ON public.formula_presets;
CREATE POLICY "formula presets public read" ON public.formula_presets
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "gm writes formula presets" ON public.formula_presets;
CREATE POLICY "gm writes formula presets" ON public.formula_presets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gm'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gm'::public.app_role));

DROP TRIGGER IF EXISTS set_formula_presets_updated_at ON public.formula_presets;
CREATE TRIGGER set_formula_presets_updated_at BEFORE UPDATE ON public.formula_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
