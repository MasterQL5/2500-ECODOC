import { createServerFn } from "@tanstack/react-start";

const GM_EMAIL = "masterql5@bureau.local";

// This is a private tool for a friend group, not a public product — the GM credential is set
// directly here rather than via environment variables, so it works without any extra hosting
// configuration. Change these two values to change the GM login.
const GM_USERNAME = "MasterQL5";
const GM_PASSWORD = "GriffinTown";

export const gmLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => input)
  .handler(async ({ data }) => {
    if (data.username.trim() !== GM_USERNAME || data.password !== GM_PASSWORD) {
      return { ok: false as const };
    }

    // The game-master account (masterql5@bureau.local) and its "gm" role already exist in the
    // database, so signing in only needs the ordinary public client — no admin/service-role key
    // required. If you ever need to recreate the account from scratch (e.g. a fresh database),
    // create a user with this email in Supabase Auth and give it the "gm" role in user_roles.
    const { createClient } = await import("@supabase/supabase-js");
    const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const SUPABASE_KEY =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error(
        "Supabase connection is not configured (missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY).",
      );
    }
    const client = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: GM_EMAIL,
      password: GM_PASSWORD,
    });
    if (signInError || !signIn.session) {
      throw new Error(
        signInError?.message ??
          "Sign-in failed. If this is a brand-new database, the game-master account needs to be created first (see comment above).",
      );
    }

    return {
      ok: true as const,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    };
  });
