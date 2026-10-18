# Sohbos Reader (ECODOC)

Economy document for the playthrough. React + TanStack Start, with data stored in Supabase.
Deployed from GitHub to Vercel.

## Development

```sh
npm i
npm run dev
```

Needs the Supabase environment variables (see `src/integrations/supabase/client.ts`) set locally and in Vercel.

## Database migrations

Run the SQL in `supabase/migrations/` in order. The latest, `20261011000000_nation_patch_budget.sql`,
lets a nation's filed expenditure estimates also update its registered Expenditures and Net income;
the app works without it, but those two register columns then only refresh on the next year advance.
