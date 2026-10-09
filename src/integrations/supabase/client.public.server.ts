// Server-side Supabase client using the public (anon/publishable) key — respects RLS.
// Use this in server functions that call SECURITY DEFINER RPCs (see nation.functions.ts):
// those functions do their own authorization internally, so the calling client only ever
// needs the same public key the browser already uses, never the service-role key.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabasePublicClient() {
  const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const SUPABASE_KEY =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}.`);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_KEY),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabasePublic: ReturnType<typeof createSupabasePublicClient> | undefined;

export const supabasePublic = new Proxy({} as ReturnType<typeof createSupabasePublicClient>, {
  get(_, prop, receiver) {
    if (!_supabasePublic) _supabasePublic = createSupabasePublicClient();
    return Reflect.get(_supabasePublic, prop, receiver);
  },
});
