ALTER TABLE public.game_state ADD COLUMN IF NOT EXISTS base_year integer NOT NULL DEFAULT 2435;

ALTER TABLE public.nations
  ADD COLUMN IF NOT EXISTS flag_emoji text,
  ADD COLUMN IF NOT EXISTS currency_group text,
  ADD COLUMN IF NOT EXISTS currency_name text,
  ADD COLUMN IF NOT EXISTS currency_symbol text,
  ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT 'earth',
  ADD COLUMN IF NOT EXISTS fiscal jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expenditure_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.commodities
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS public.nation_secrets (
  nation_id uuid PRIMARY KEY REFERENCES public.nations(id) ON DELETE CASCADE,
  access_code text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nation_secrets TO authenticated;
GRANT ALL ON public.nation_secrets TO service_role;
ALTER TABLE public.nation_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gm manages nation secrets" ON public.nation_secrets FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gm'::app_role)) WITH CHECK (has_role(auth.uid(), 'gm'::app_role));

CREATE TABLE IF NOT EXISTS public.formula_settings (
  id integer PRIMARY KEY DEFAULT 1,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT formula_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.formula_settings TO anon, authenticated;
GRANT ALL ON public.formula_settings TO service_role;
ALTER TABLE public.formula_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formula public read" ON public.formula_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "gm updates formula" ON public.formula_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gm'::app_role)) WITH CHECK (has_role(auth.uid(), 'gm'::app_role));
INSERT INTO public.formula_settings (id, params) VALUES (1, jsonb_build_object(
  'income_tax_rate', 0.07,
  'labor_participation', 0.65,
  'labor_share_gdp', 0.59,
  'corporate_tax_rate', 0.07,
  'manufacturing_multiplier', 1.5,
  'corporate_share_go', 0.65,
  'mean_profit_margin', 0.2,
  'urban_lvt_rate', 0.031,
  'suburban_lvt_rate', 0.016,
  'rural_lvt_rate', 0.0,
  'excise_revenue', 0
)) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  anchor_acronym text,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.currencies TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies public read" ON public.currencies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "gm writes currencies" ON public.currencies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gm'::app_role)) WITH CHECK (has_role(auth.uid(), 'gm'::app_role));

GRANT SELECT ON public.year_snapshots TO anon, authenticated;