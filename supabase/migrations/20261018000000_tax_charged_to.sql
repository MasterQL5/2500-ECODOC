-- Lets a tax be "charged to" another state (Formula Workbench -> Charged to).
-- Safe to run more than once.
alter table public.tax_formulas add column if not exists charged_to text;
