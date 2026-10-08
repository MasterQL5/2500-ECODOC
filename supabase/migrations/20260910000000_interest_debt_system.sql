-- Credit tiers: cosmetic names (changeable) that always map to a fixed interest markup. Seeded
-- with the ten standard levels. sort_order fixes the AAA..D ranking regardless of name changes.
CREATE TABLE public.credit_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  interest_markup numeric NOT NULL,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.credit_tiers TO authenticated;
GRANT ALL ON public.credit_tiers TO service_role;
ALTER TABLE public.credit_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit tiers public read" ON public.credit_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "gm writes credit tiers" ON public.credit_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gm'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'gm'::app_role));
CREATE TRIGGER credit_tiers_updated BEFORE UPDATE ON public.credit_tiers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.credit_tiers (name, interest_markup, sort_order) VALUES
  ('AAA', 0.015, 10),
  ('AA', 0.017, 20),
  ('A', 0.022, 30),
  ('BBB', 0.030, 40),
  ('BB', 0.0427, 50),
  ('B', 0.058, 60),
  ('CCC', 0.076, 70),
  ('CC', 0.098, 80),
  ('C', 0.124, 90),
  ('D', 0.20, 100);

-- Each nation's base rate (added to whatever tier markup was in effect when a given tranche of
-- debt was taken out) and which tier it currently sits at (governs the rate on *new* debt only —
-- changing tier never retroactively changes the rate already locked into existing tranches).
ALTER TABLE public.nations
  ADD COLUMN IF NOT EXISTS base_interest_rate numeric NOT NULL DEFAULT 0.058,
  ADD COLUMN IF NOT EXISTS credit_tier_id uuid REFERENCES public.credit_tiers(id);

-- One row per tranche of debt: a bond, a loan, or the nation's general/legacy debt pool. Each
-- tranche's rate is fixed at creation — set from the nation's base_interest_rate plus whatever
-- credit_tiers.interest_markup was in effect for its tier at that moment — and never changes
-- again even if the nation's credit rating later moves. "General" tranches (is_general = true)
-- represent the ordinary undifferentiated debt pool; a nation may have at most one at a time,
-- and it's what year-advance compounds automatically and what a manual debt edit adjusts.
-- Named tranches (is_general = false) are specific instruments — an international loan, a bond
-- issue — carved out with their own terms, exactly as requested for simulating real contracts.
CREATE TABLE public.debt_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_id uuid NOT NULL REFERENCES public.nations(id) ON DELETE CASCADE,
  label text NOT NULL,
  principal numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL,
  is_general boolean NOT NULL DEFAULT false,
  credit_tier_name_at_issue text,
  issued_year int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.debt_instruments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.debt_instruments TO authenticated;
GRANT ALL ON public.debt_instruments TO service_role;
ALTER TABLE public.debt_instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debt instruments public read" ON public.debt_instruments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "gm writes debt instruments" ON public.debt_instruments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gm'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'gm'::app_role));
CREATE TRIGGER debt_instruments_updated BEFORE UPDATE ON public.debt_instruments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon, authenticated;

-- Every nation's current credit_score_tri/credit_rating (the letter grade already on file) is
-- matched to the new tiers table by name where possible, defaulting to B (the mid-point,
-- matching the requested base 5.8% rate) where no existing rating matches a known tier name.
UPDATE public.nations n
SET credit_tier_id = t.id
FROM public.credit_tiers t
WHERE n.credit_rating IS NOT NULL AND upper(trim(n.credit_rating)) = t.name;

UPDATE public.nations
SET credit_tier_id = (SELECT id FROM public.credit_tiers WHERE name = 'B')
WHERE credit_tier_id IS NULL;

-- Every nation's existing single `debt` figure becomes one general tranche, dated to the
-- current fiscal year, at that nation's current tier's rate — "all current debt nations have
-- should just be set to the current universally agreed upon credit rating."
INSERT INTO public.debt_instruments (nation_id, label, principal, interest_rate, is_general, credit_tier_name_at_issue, issued_year)
SELECT
  n.id,
  'General debt',
  COALESCE(n.debt, 0),
  COALESCE(t.interest_markup, n.base_interest_rate, 0.058),
  true,
  t.name,
  (SELECT current_year FROM public.game_state WHERE id = 1)
FROM public.nations n
LEFT JOIN public.credit_tiers t ON t.id = n.credit_tier_id;
