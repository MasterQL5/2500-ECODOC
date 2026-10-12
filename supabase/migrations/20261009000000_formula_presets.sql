-- Reusable tax formula presets (e.g. "Corporate Tax"), copied onto any state from the workbench.
CREATE TABLE IF NOT EXISTS public.formula_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  brackets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.formula_presets TO anon;
GRANT SELECT ON public.formula_presets TO authenticated;
GRANT ALL ON public.formula_presets TO service_role;
ALTER TABLE public.formula_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formula presets public read" ON public.formula_presets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "gm writes formula presets" ON public.formula_presets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gm'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'gm'::app_role));
CREATE TRIGGER set_formula_presets_updated_at BEFORE UPDATE ON public.formula_presets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
