
ALTER TABLE public.nations
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS info_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS flag_url text;

UPDATE public.currencies SET name = 'Pula', symbol = '℘' WHERE code = 'SSF';
UPDATE public.nations SET currency_name = 'Pula', currency_symbol = '℘' WHERE currency_group = 'SSF';

UPDATE public.currencies SET name = 'Arabian Riyal', symbol = '⃁' WHERE code = 'ARA';
UPDATE public.currencies SET name = 'Argentine Peso', symbol = 'AR$' WHERE code = 'ARG';
UPDATE public.currencies SET name = 'Brazilian Real', symbol = 'R$' WHERE code = 'BRZ';
UPDATE public.currencies SET name = 'Chilean Peso', symbol = 'C$' WHERE code = 'CHI';
UPDATE public.currencies SET name = 'Egyptian Pound', symbol = 'جُنَيْه' WHERE code = 'EGY';
UPDATE public.currencies SET name = 'Nusantaran Rupiah', symbol = 'Rp' WHERE code = 'NUS';

UPDATE public.nations n SET currency_name = c.name, currency_symbol = c.symbol
FROM public.currencies c
WHERE n.currency_group = c.code AND c.code IN ('ARA','ARG','BRZ','CHI','EGY','NUS');

INSERT INTO public.nations (acronym, name, currency_group, currency_name, currency_symbol, body, sort_order)
SELECT 'ZAF', 'South Africa', 'ZAF', 'Rand', '𝐑', 'earth', 0
WHERE NOT EXISTS (SELECT 1 FROM public.nations WHERE acronym = 'ZAF');

INSERT INTO public.currencies (code, name, symbol, anchor_acronym, sort_order)
SELECT 'ZAF', 'Rand', '𝐑', 'ZAF', 0
WHERE NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = 'ZAF');
