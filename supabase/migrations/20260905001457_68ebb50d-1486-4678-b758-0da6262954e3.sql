ALTER TABLE public.tax_formulas ADD COLUMN IF NOT EXISTS group_name text;
UPDATE public.tax_formulas SET group_name = name WHERE group_name IS NULL;
ALTER TABLE public.nations ADD COLUMN IF NOT EXISTS text_color text;