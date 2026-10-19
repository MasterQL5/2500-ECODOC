-- ECODOC: two optional columns on tax_formulas.
--   charged_to : the state a tax is charged to (Formula Workbench -> "Charged to")
--   disabled   : a tax switched off in the workbench (stays on the ledger, yields nothing)
-- Safe to run more than once.
alter table public.tax_formulas add column if not exists charged_to text;
alter table public.tax_formulas add column if not exists disabled boolean not null default false;
