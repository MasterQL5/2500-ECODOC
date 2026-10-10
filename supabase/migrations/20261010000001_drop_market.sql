-- OPTIONAL. The Market tab and its code have been removed from the app, so nothing reads the
-- commodities table any more. Run this only if you want the table and its data deleted for good.
-- Skipping it is harmless; old year snapshots may still hold commodity rows, which are ignored.
DROP TABLE IF EXISTS public.commodities;
