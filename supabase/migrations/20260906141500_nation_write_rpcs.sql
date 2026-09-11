-- Nation players write to their own nation's row via an access code, not a Supabase login, so
-- ordinary RLS (which is keyed on auth.uid()) can't express "this code holder may edit this one
-- nation." Previously this was handled by running the writes through the admin/service-role
-- client, bypassing RLS entirely for the whole nation.functions.ts flow. That key isn't
-- available on a plain Vercel deploy without extra configuration, so instead each nation write
-- is now its own SECURITY DEFINER function that re-checks the access code itself, then performs
-- exactly one narrow, pre-defined write — never an arbitrary one — so a bad code can't be used
-- to touch anything beyond what these functions explicitly allow.

CREATE OR REPLACE FUNCTION public._check_nation_code(_acronym text, _code text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nation_id uuid;
  _ok boolean;
BEGIN
  SELECT n.id INTO _nation_id FROM public.nations n WHERE n.acronym ILIKE _acronym;
  IF _nation_id IS NULL THEN
    RAISE EXCEPTION 'No such registry';
  END IF;
  SELECT (s.access_code = _code) INTO _ok FROM public.nation_secrets s WHERE s.nation_id = _nation_id;
  IF _ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Access code rejected';
  END IF;
  RETURN _nation_id;
END;
$$;
-- Not granted to anon/authenticated directly — it's a helper for the functions below.

-- Patch an arbitrary set of columns on the caller's own nation row. The column set is still
-- constrained by jsonb_populate_record-style safety: only keys that already exist as columns
-- on `nations` can be set, so this cannot be used to reach outside that one table/row.
CREATE OR REPLACE FUNCTION public.nation_patch(_acronym text, _code text, _patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  _id := public._check_nation_code(_acronym, _code);
  UPDATE public.nations SET
    name = COALESCE(_patch->>'name', name),
    flag_emoji = COALESCE(_patch->>'flag_emoji', flag_emoji),
    currency_name = COALESCE(_patch->>'currency_name', currency_name),
    currency_symbol = COALESCE(_patch->>'currency_symbol', currency_symbol),
    fiscal = COALESCE(_patch->'fiscal', fiscal),
    expenditure_items = COALESCE(_patch->'expenditure_items', expenditure_items),
    summary = COALESCE(_patch->>'summary', summary),
    info_rows = COALESCE(_patch->'info_rows', info_rows),
    flag_url = CASE WHEN _patch ? 'flag_url' THEN (_patch->>'flag_url') ELSE flag_url END
  WHERE id = _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.nation_patch(text, text, jsonb) TO anon, authenticated;

-- Mirror a currency name/symbol change across every nation sharing that currency bloc, and
-- upsert the shared currencies register row — this is the one nation-side action that touches
-- rows outside the caller's own nation (siblings in the same currency bloc), which is why it's
-- its own function rather than a generic column patch.
CREATE OR REPLACE FUNCTION public.nation_set_currency(
  _acronym text, _code text, _currency_name text, _currency_symbol text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _group text;
  _anchor text;
BEGIN
  _id := public._check_nation_code(_acronym, _code);
  SELECT COALESCE(currency_group, acronym), acronym INTO _group, _anchor FROM public.nations WHERE id = _id;

  UPDATE public.nations SET
    currency_name = COALESCE(NULLIF(_currency_name, ''), currency_name),
    currency_symbol = COALESCE(NULLIF(_currency_symbol, ''), currency_symbol)
  WHERE currency_group = _group OR (currency_group IS NULL AND acronym = _group);

  INSERT INTO public.currencies (code, name, symbol, anchor_acronym, sort_order)
  VALUES (_group, COALESCE(NULLIF(_currency_name, ''), _group), COALESCE(_currency_symbol, ''), _anchor, 0)
  ON CONFLICT (code) DO UPDATE SET
    name = COALESCE(NULLIF(EXCLUDED.name, ''), public.currencies.name),
    symbol = COALESCE(NULLIF(EXCLUDED.symbol, ''), public.currencies.symbol);
END;
$$;
GRANT EXECUTE ON FUNCTION public.nation_set_currency(text, text, text, text) TO anon, authenticated;

-- Tax-rate revision: patch the fiscal jsonb and file a gazette ruling in one step, matching what
-- setNationTaxRates previously did with two admin-client calls.
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
  _year int;
BEGIN
  _id := public._check_nation_code(_acronym, _code);
  UPDATE public.nations SET fiscal = _fiscal WHERE id = _id;
  SELECT current_year INTO _year FROM public.game_state WHERE id = 1;
  INSERT INTO public.rulings (year, title, body, status, effects)
  VALUES (COALESCE(_year, 2517), _ruling_title, _ruling_body, 'applied', '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.nation_set_tax_rates(text, text, jsonb, text, text) TO anon, authenticated;

-- Add a nation-filed revenue-source formula row (a flat amount, source = 'nation').
CREATE OR REPLACE FUNCTION public.nation_add_revenue_source(
  _acronym text, _code text, _name text, _amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _next_sort int;
BEGIN
  _id := public._check_nation_code(_acronym, _code);
  SELECT COALESCE(MAX(sort_order), 0) + 10 INTO _next_sort FROM public.tax_formulas WHERE nation_id = _id;
  INSERT INTO public.tax_formulas (nation_id, name, tokens, sort_order, source)
  VALUES (_id, _name, jsonb_build_array(jsonb_build_object('t', 'num', 'v', _amount)), _next_sort, 'nation');
END;
$$;
GRANT EXECUTE ON FUNCTION public.nation_add_revenue_source(text, text, text, numeric) TO anon, authenticated;

-- Remove a nation-filed revenue source. Restricted to source = 'nation' rows belonging to the
-- caller's own nation, so a code holder can never delete a Bureau-filed formula this way.
CREATE OR REPLACE FUNCTION public.nation_remove_revenue_source(_acronym text, _code text, _formula_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  _id := public._check_nation_code(_acronym, _code);
  DELETE FROM public.tax_formulas WHERE id = _formula_id AND nation_id = _id AND source = 'nation';
END;
$$;
GRANT EXECUTE ON FUNCTION public.nation_remove_revenue_source(text, text, uuid) TO anon, authenticated;

-- Plain "is this code correct" check, for the login screen itself.
CREATE OR REPLACE FUNCTION public.verify_nation_code(_acronym text, _code text)
RETURNS TABLE(nation_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT public._check_nation_code(_acronym, _code);
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_nation_code(text, text) TO anon, authenticated;
