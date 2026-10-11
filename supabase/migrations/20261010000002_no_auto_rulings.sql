-- Gazette rulings are manual only. This replaces the old tax-rate function so that, even if
-- something still calls it, it saves the rates and files no ruling. The app no longer calls it.
CREATE OR REPLACE FUNCTION public.nation_set_tax_rates(
  _acronym text, _code text, _fiscal jsonb, _ruling_title text, _ruling_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  _id := public._check_nation_code(_acronym, _code);
  UPDATE public.nations SET fiscal = _fiscal WHERE id = _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.nation_set_tax_rates(text, text, jsonb, text, text) TO anon, authenticated;
