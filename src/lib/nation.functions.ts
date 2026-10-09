import { createServerFn } from "@tanstack/react-start";
import { isDebtExpenditureLabel } from "./fiscal";

type Codeful = { acronym: string; code: string };

async function db() {
  const { supabasePublic } = await import("@/integrations/supabase/client.public.server");
  return supabasePublic;
}

/**
 * Fetch the caller's nation row for read purposes (display, computing a patch, etc.) using the
 * public client. This is a plain SELECT, already allowed for anyone under RLS ("nations public
 * read"), so it needs no special privilege — only the *writes* need the RPCs below, since RLS
 * has no way to say "this code holder may edit this one nation".
 */
async function fetchNation(acronym: string) {
  const client = await db();
  const { data: nation, error } = await client
    .from("nations")
    .select(
      "id, acronym, name, fiscal, currency_name, currency_symbol, flag_emoji, gdp_nominal, expenditure_items",
    )
    .ilike("acronym", acronym)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!nation) throw new Error("No such registry");
  return nation;
}

export const verifyNationCode = createServerFn({ method: "POST" })
  .inputValidator((input: Codeful) => input)
  .handler(async ({ data }) => {
    const client = await db();
    const { error } = await client.rpc(
      "verify_nation_code" as never,
      {
        _acronym: data.acronym,
        _code: data.code,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNationProfile = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: Codeful & {
        name?: string;
        flag_emoji?: string;
        currency_name?: string;
        currency_symbol?: string;
      },
    ) => input,
  )
  .handler(async ({ data }) => {
    const client = await db();
    const patch: Record<string, string> = {};
    for (const key of ["name", "flag_emoji", "currency_name", "currency_symbol"] as const) {
      const v = data[key];
      if (typeof v === "string" && v.trim() !== "") patch[key] = v.trim();
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { name, flag_emoji } = patch;
    if (name || flag_emoji) {
      const { error } = await client.rpc(
        "nation_patch" as never,
        {
          _acronym: data.acronym,
          _code: data.code,
          _patch: { name, flag_emoji },
        } as never,
      );
      if (error) throw new Error(error.message);
    }

    // Currency name/symbol are mirrored across the whole currency bloc (siblings sharing the
    // same currency) and the shared currencies register, which the Exchange page reads from —
    // that cross-nation reach is why it's a dedicated RPC rather than the generic column patch.
    if (patch["currency_name"] || patch["currency_symbol"]) {
      const { error } = await client.rpc(
        "nation_set_currency" as never,
        {
          _acronym: data.acronym,
          _code: data.code,
          _currency_name: patch["currency_name"] ?? "",
          _currency_symbol: patch["currency_symbol"] ?? "",
        } as never,
      );
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

/** Revise standing tax rates. This only saves the rates: it never files a gazette ruling. Gazette
 * entries are written by hand from the GM page and nowhere else. */
export const setNationTaxRates = createServerFn({ method: "POST" })
  .inputValidator((input: Codeful & { rates: Record<string, number> }) => input)
  .handler(async ({ data }) => {
    const client = await db();
    const nation = await fetchNation(data.acronym);
    const fiscal = { ...((nation.fiscal ?? {}) as Record<string, number>) };
    let changes = 0;
    for (const [key, raw] of Object.entries(data.rates)) {
      const to = Number(raw);
      if (!Number.isFinite(to) || to < 0 || to > 1) continue;
      const from = Number(fiscal[key] ?? 0);
      if (Math.abs(from - to) < 1e-9) continue;
      fiscal[key] = to;
      changes++;
    }
    if (changes === 0) return { ok: true, changes: 0 };

    const { error } = await client.rpc(
      "nation_patch" as never,
      { _acronym: data.acronym, _code: data.code, _patch: { fiscal } } as never,
    );
    if (error) throw new Error(error.message);

    return { ok: true, changes };
  });

export const addNationRevenueSource = createServerFn({ method: "POST" })
  .inputValidator((input: Codeful & { name: string; amount: number }) => input)
  .handler(async ({ data }) => {
    const client = await db();
    const name = data.name?.trim();
    const amount = Number(data.amount);
    if (!name) throw new Error("Name the revenue source");
    if (!Number.isFinite(amount)) throw new Error("Amount must be a number");
    const { error } = await client.rpc(
      "nation_add_revenue_source" as never,
      {
        _acronym: data.acronym,
        _code: data.code,
        _name: name,
        _amount: amount,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeNationRevenueSource = createServerFn({ method: "POST" })
  .inputValidator((input: Codeful & { formulaId: string }) => input)
  .handler(async ({ data }) => {
    const client = await db();
    const { error } = await client.rpc(
      "nation_remove_revenue_source" as never,
      {
        _acronym: data.acronym,
        _code: data.code,
        _formula_id: data.formulaId,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addNationExpenditureItem = createServerFn({ method: "POST" })
  .inputValidator((input: Codeful & { label: string; amount: number }) => input)
  .handler(async ({ data }) => {
    const client = await db();
    const label = data.label?.trim();
    const amount = Number(data.amount);
    if (!label) throw new Error("Name the expenditure");
    if (!Number.isFinite(amount)) throw new Error("Amount must be a number");
    const nation = await fetchNation(data.acronym);
    const { data: row } = await client
      .from("nations")
      .select("expenditure_items")
      .eq("id", nation.id)
      .single();
    const items = Array.isArray(row?.expenditure_items)
      ? (row.expenditure_items as { label: string; amount?: number }[])
      : [];
    items.push({ label, amount });
    const { error } = await client.rpc(
      "nation_patch" as never,
      {
        _acronym: data.acronym,
        _code: data.code,
        _patch: { expenditure_items: items },
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setNationExpenditureItems = createServerFn({ method: "POST" })
  .inputValidator(
    (input: Codeful & { items: { label: string; amount: number }[]; inflate?: boolean }) => input,
  )
  .handler(async ({ data }) => {
    const client = await db();
    const nation = await fetchNation(data.acronym);
    const submitted = (data.items ?? [])
      .map((i) => ({ label: String(i.label ?? "").trim(), amount: Number(i.amount) }))
      .filter((i) => i.label !== "" && Number.isFinite(i.amount));
    // Debt lines (interest, debt service) come from the debt register only. Refuse hand-typed
    // ones, and always carry over what is already on file rather than trusting the client's copy.
    const reserved = submitted.find((i) => isDebtExpenditureLabel(i.label));
    if (reserved) {
      throw new Error(
        `"${reserved.label}" is reserved for debt payments and is set from the debt register, not by hand`,
      );
    }
    const lockedOnFile = ((nation.expenditure_items ?? []) as { label: string }[]).filter((i) =>
      isDebtExpenditureLabel(i.label),
    );
    const items = [...submitted, ...lockedOnFile];
    const patch: Record<string, unknown> = { expenditure_items: items };
    if (typeof data.inflate === "boolean") {
      patch["fiscal"] = {
        ...((nation.fiscal ?? {}) as Record<string, unknown>),
        __inflate_expenditures: data.inflate,
      };
    }
    const { error } = await client.rpc(
      "nation_patch" as never,
      {
        _acronym: data.acronym,
        _code: data.code,
        _patch: patch,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setNationCustomVariables = createServerFn({ method: "POST" })
  .inputValidator((input: Codeful & { values: Record<string, number> }) => input)
  .handler(async ({ data }) => {
    const nation = await fetchNation(data.acronym);
    const client = await db();
    const currentFiscal = (nation.fiscal ?? {}) as Record<string, unknown>;
    const customKeys = new Set(
      Array.isArray(currentFiscal["__custom_vars"])
        ? (currentFiscal["__custom_vars"] as { key: string }[]).map((v) => v.key)
        : [],
    );
    const visibleKeys = new Set(
      Array.isArray(currentFiscal["__visible_fields"])
        ? (currentFiscal["__visible_fields"] as unknown[]).filter(
            (k): k is string => typeof k === "string",
          )
        : [],
    );
    const patch: Record<string, number> = {};
    for (const [key, raw] of Object.entries(data.values)) {
      // A field may be written here only if the GM has explicitly exposed it — either as a
      // custom variable, or by marking any field (including a standard Bureau field like
      // income_tax_rate) visible to the player from the Formula Workbench's Variables tab.
      if (!customKeys.has(key) && !visibleKeys.has(key)) continue;
      const v = Number(raw);
      if (Number.isFinite(v)) patch[key] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const fiscal = { ...currentFiscal, ...patch };
    const { error } = await client.rpc(
      "nation_patch" as never,
      {
        _acronym: data.acronym,
        _code: data.code,
        _patch: { fiscal },
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setNationInformation = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: Codeful & {
        summary?: string;
        rows?: { label: string; value: string }[];
        flag_url?: string | null;
      },
    ) => input,
  )
  .handler(async ({ data }) => {
    const client = await db();
    const patch: Record<string, unknown> = {};
    if (typeof data.summary === "string") patch["summary"] = data.summary.slice(0, 4000);
    if (Array.isArray(data.rows)) {
      patch["info_rows"] = data.rows
        .map((r) => ({
          label: String(r.label ?? "").slice(0, 120),
          value: String(r.value ?? "").slice(0, 600),
        }))
        .filter((r) => r.label.trim() !== "");
    }
    if (data.flag_url !== undefined) {
      const url = data.flag_url;
      if (url === null || url === "") patch["flag_url"] = null;
      else {
        if (!/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(url)) {
          throw new Error("Flag must be an uploaded image file");
        }
        if (url.length > 700_000) throw new Error("Flag image too large — keep it under 500 KB");
        patch["flag_url"] = url;
      }
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await client.rpc(
      "nation_patch" as never,
      {
        _acronym: data.acronym,
        _code: data.code,
        _patch: patch,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
