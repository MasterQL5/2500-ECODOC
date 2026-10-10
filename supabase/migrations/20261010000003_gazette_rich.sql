-- Gazette entries gain an in-world date line and attached images. Body text now carries
-- formatting tags ([b] [i] [u] [s] [color=] [hl=] [censor] [url=] [img=]); plain old entries
-- keep working unchanged.
ALTER TABLE public.rulings ADD COLUMN IF NOT EXISTS entry_date text;
ALTER TABLE public.rulings ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
