-- Let a code-holder filing of a tax rate also refile the registered revenue it moves (the app
-- recomputes revenue server-side from the nation's own tax formulas and sends the figure along).
-- Everything else about nation_patch is unchanged: one pre-defined set of columns, on the
-- caller's own row only, with the access code re-checked on every call.

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
    expenditures = CASE WHEN _patch ? 'expenditures' THEN (_patch->>'expenditures')::numeric ELSE expenditures END,
    revenue = CASE WHEN _patch ? 'revenue' THEN (_patch->>'revenue')::numeric ELSE revenue END,
    net_income = CASE WHEN _patch ? 'net_income' THEN (_patch->>'net_income')::numeric ELSE net_income END,
    summary = COALESCE(_patch->>'summary', summary),
    info_rows = COALESCE(_patch->'info_rows', info_rows),
    flag_url = CASE WHEN _patch ? 'flag_url' THEN (_patch->>'flag_url') ELSE flag_url END
  WHERE id = _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.nation_patch(text, text, jsonb) TO anon, authenticated;
