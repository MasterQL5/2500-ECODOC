CREATE TABLE public.tax_formulas (
  id uuid primary key default gen_random_uuid(),
  nation_id uuid references public.nations(id) on delete cascade not null,
  name text not null,
  tokens jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  source text not null default 'bureau',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.tax_formulas TO anon;
GRANT SELECT ON public.tax_formulas TO authenticated;
GRANT ALL ON public.tax_formulas TO service_role;
ALTER TABLE public.tax_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax formulas public read" ON public.tax_formulas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "gm writes tax formulas" ON public.tax_formulas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gm'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'gm'::app_role));
CREATE TRIGGER set_tax_formulas_updated_at BEFORE UPDATE ON public.tax_formulas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the six standard revenue lines for every nation as modular token formulas.
WITH n AS (SELECT id FROM public.nations),
seed(name, ord, tokens) AS (
  VALUES
  ('Income tax', 10,
   '[{"t":"stat","k":"gdp_nominal"},{"t":"op","v":"*"},{"t":"fiscal","k":"labor_share_gdp"},{"t":"op","v":"*"},{"t":"fiscal","k":"labor_participation"},{"t":"op","v":"*"},{"t":"fiscal","k":"income_tax_rate"}]'::jsonb),
  ('Corporate tax', 20,
   '[{"t":"stat","k":"gdp_nominal"},{"t":"op","v":"*"},{"t":"fiscal","k":"manufacturing_multiplier"},{"t":"op","v":"*"},{"t":"fiscal","k":"corporate_share_go"},{"t":"op","v":"*"},{"t":"fiscal","k":"mean_profit_margin"},{"t":"op","v":"*"},{"t":"fiscal","k":"corporate_tax_rate"}]'::jsonb),
  ('Urban land value tax', 30,
   '[{"t":"fiscal","k":"urban_acres"},{"t":"op","v":"*"},{"t":"fiscal","k":"urban_value"},{"t":"op","v":"*"},{"t":"fiscal","k":"urban_lvt_rate"}]'::jsonb),
  ('Suburban land value tax', 40,
   '[{"t":"fiscal","k":"suburban_acres"},{"t":"op","v":"*"},{"t":"fiscal","k":"suburban_value"},{"t":"op","v":"*"},{"t":"fiscal","k":"suburban_lvt_rate"}]'::jsonb),
  ('Rural land value tax', 50,
   '[{"t":"fiscal","k":"rural_acres"},{"t":"op","v":"*"},{"t":"fiscal","k":"rural_value"},{"t":"op","v":"*"},{"t":"fiscal","k":"rural_lvt_rate"}]'::jsonb),
  ('Excise & other', 60,
   '[{"t":"fiscal","k":"excise_revenue"}]'::jsonb)
)
INSERT INTO public.tax_formulas (nation_id, name, tokens, sort_order, source)
SELECT n.id, seed.name, seed.tokens, seed.ord, 'bureau' FROM n CROSS JOIN seed;