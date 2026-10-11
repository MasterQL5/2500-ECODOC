UPDATE public.nations
SET expenditure_items = '[
 {"label":"Defence & fleet","share":0.22},
 {"label":"Health & sanitation","share":0.20},
 {"label":"Education & research","share":0.15},
 {"label":"Infrastructure & orbital works","share":0.14},
 {"label":"Social security","share":0.13},
 {"label":"Administration","share":0.08},
 {"label":"Debt service","share":0.08}
]'::jsonb
WHERE expenditure_items IS NULL OR jsonb_array_length(expenditure_items) = 0;