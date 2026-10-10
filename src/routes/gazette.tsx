import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BureauShell } from "@/components/BureauShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { GazetteBody, safeUrl } from "@/lib/gazetteMarkup";
import type { Ruling } from "@/lib/econ";
import { gameStateQuery, rulingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/gazette")({
  head: () => ({
    meta: [
      { title: "Gazette — Bureau of Interstellar Statistics" },
      {
        name: "description",
        content: "Official register of rulings and amendments.",
      },
      { property: "og:title", content: "Gazette — Bureau of Interstellar Statistics" },
      {
        property: "og:description",
        content: "Rulings and events affecting national accounts.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gameStateQuery),
      context.queryClient.ensureQueryData(rulingsQuery),
    ]);
  },
  component: GazettePage,
});

const MAX_IMAGE_BYTES = 500_000;

type FormState = {
  title: string;
  year: number;
  entryDate: string;
  body: string;
  images: string[];
};

function ToolButton({
  label,
  title,
  onClick,
  className = "",
}: {
  label: string;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary ${className}`}
    >
      {label}
    </button>
  );
}

/** The GM-only writer: title, year, date, a formatting toolbar, live preview and images. */
function EntryEditor({
  initial,
  editing,
  onDone,
}: {
  initial: FormState;
  editing: Ruling | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [textColor, setTextColor] = useState("#e11d48");
  const [markColor, setMarkColor] = useState("#facc15");
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function wrap(open: string, close: string, fallback = "text") {
    const el = area.current;
    const start = el?.selectionStart ?? form.body.length;
    const end = el?.selectionEnd ?? form.body.length;
    const chosen = form.body.slice(start, end) || fallback;
    const next = form.body.slice(0, start) + open + chosen + close + form.body.slice(end);
    setForm({ ...form, body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + open.length, start + open.length + chosen.length);
    });
  }

  function addLink() {
    const url = window.prompt("Link address (https://…):");
    if (!url) return;
    if (!safeUrl(url)) {
      toast.error("Links must start with http:// or https://");
      return;
    }
    wrap(`[url=${url.trim()}]`, "[/url]", "link text");
  }

  function addImageUrl() {
    const url = window.prompt("Image address (https://…):");
    if (!url) return;
    if (!safeUrl(url)) {
      toast.error("Images must be http:// or https:// addresses");
      return;
    }
    setForm({ ...form, images: [...form.images, url.trim()] });
  }

  function addImageFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
      toast.error("Use a PNG, JPEG, GIF or WebP image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image too large — keep it under 500 KB, or link to it instead");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (safeUrl(result, true)) setForm((f) => ({ ...f, images: [...f.images, result] }));
    };
    reader.readAsDataURL(file);
  }

  function insertInlineImage(src: string) {
    if (!src.startsWith("http")) {
      toast.error("Only linked (https) images can be placed inside the text");
      return;
    }
    const el = area.current;
    const at = el?.selectionStart ?? form.body.length;
    setForm({ ...form, body: `${form.body.slice(0, at)}\n[img=${src}]\n${form.body.slice(at)}` });
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error("Give the entry a title");
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      year: form.year,
      title: form.title.trim(),
      body: form.body,
      status: "applied",
    };
    // Only touched when used, so the page keeps working before the new columns exist.
    if (form.entryDate.trim() || editing?.entry_date) payload["entry_date"] = form.entryDate.trim();
    if (form.images.length > 0 || (editing?.images?.length ?? 0) > 0)
      payload["images"] = form.images;
    const { error } = editing
      ? await supabase
          .from("rulings")
          .update(payload as never)
          .eq("id", editing.id)
      : await supabase.from("rulings").insert(payload as never);
    setBusy(false);
    if (error) {
      toast.error(
        `${error.message} — if this mentions a missing column, run the gazette SQL in Supabase.`,
      );
      return;
    }
    await qc.invalidateQueries({ queryKey: ["rulings"] });
    toast.success(editing ? "Entry amended" : "Entry published");
    onDone();
  }

  return (
    <section className="mb-8 space-y-3 rounded border border-primary/40 bg-card p-4">
      <h2 className="rule-label">{editing ? "Amend entry" : "New gazette entry"}</h2>
      <div className="flex flex-wrap gap-2">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title"
          className="min-w-[16rem] flex-1 rounded border border-border bg-background px-3 py-2 text-sm font-semibold"
        />
        <label className="flex items-center gap-1 text-sm">
          <span className="rule-label">Year</span>
          <input
            type="number"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
            className="w-24 rounded border border-border bg-background px-2 py-2 text-sm"
          />
        </label>
        <input
          value={form.entryDate}
          onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
          placeholder="Date (e.g. 14 March 2517)"
          className="w-56 rounded border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton
          label="B"
          title="Bold"
          className="font-bold"
          onClick={() => wrap("[b]", "[/b]")}
        />
        <ToolButton
          label="I"
          title="Italic"
          className="italic"
          onClick={() => wrap("[i]", "[/i]")}
        />
        <ToolButton
          label="U"
          title="Underline stripe"
          className="underline"
          onClick={() => wrap("[u]", "[/u]")}
        />
        <ToolButton
          label="S"
          title="Strike through"
          className="line-through"
          onClick={() => wrap("[s]", "[/s]")}
        />
        <span className="mx-1 h-5 w-px bg-border" />
        <input
          type="color"
          value={textColor}
          onChange={(e) => setTextColor(e.target.value)}
          title="Text colour"
          className="h-7 w-8 cursor-pointer rounded border border-border bg-background"
        />
        <ToolButton
          label="Colour text"
          title="Colour the selected words"
          onClick={() => wrap(`[color=${textColor}]`, "[/color]")}
        />
        <input
          type="color"
          value={markColor}
          onChange={(e) => setMarkColor(e.target.value)}
          title="Highlight colour"
          className="h-7 w-8 cursor-pointer rounded border border-border bg-background"
        />
        <ToolButton
          label="Highlight"
          title="Highlight the selected words"
          onClick={() => wrap(`[hl=${markColor}]`, "[/hl]")}
        />
        <ToolButton
          label="Censor"
          title="Black out the selected words (they are not shown to readers)"
          onClick={() => wrap("[censor]", "[/censor]", "classified")}
        />
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Link" title="Turn the selected words into a link" onClick={addLink} />
        <ToolButton label="+ Image URL" title="Attach an image by address" onClick={addImageUrl} />
        <ToolButton
          label="+ Image file"
          title="Attach an image from your computer (under 500 KB)"
          onClick={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            addImageFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <textarea
        ref={area}
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        rows={8}
        placeholder="Write the entry. Select words, then use the buttons above to format them."
        className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-sm"
      />
      <p className="text-[11px] text-muted-foreground">
        Censored words are replaced by blocks for readers, but the original text is still stored
        with the entry, so don't type anything there that must stay truly secret.
      </p>

      {form.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {form.images.map((src, i) => (
            <div key={i} className="relative rounded border border-border p-1">
              <img src={src} alt="" className="h-20 w-auto rounded" />
              <div className="mt-1 flex gap-1">
                {src.startsWith("http") && (
                  <button
                    type="button"
                    onClick={() => insertInlineImage(src)}
                    className="rounded border border-border px-1 text-[10px] hover:border-primary"
                    title="Also place this image inside the text at the cursor"
                  >
                    in text
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, images: form.images.filter((_, j) => j !== i) })
                  }
                  className="rounded border border-destructive/50 px-1 text-[10px] text-destructive"
                >
                  remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="rule-label mb-1">Preview</div>
        <div className="rounded border border-dashed border-border p-3">
          <h3 className="text-lg font-semibold text-primary">{form.title || "Title"}</h3>
          <GazetteBody body={form.body} className="mt-2" />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {editing ? "Save amendment" : "Publish to gazette"}
        </button>
        <button onClick={onDone} className="rounded border border-border px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}

function GazettePage() {
  const { data: rulings } = useSuspenseQuery(rulingsQuery);
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { isGm } = useSession();
  const qc = useQueryClient();
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<Ruling | null>(null);
  const [yearTab, setYearTab] = useState<number | "all">("all");

  // Every year's entries stay on this page; newest year first, newest entry first within it.
  const sorted = useMemo(
    () => [...rulings].sort((a, b) => b.year - a.year || b.created_at.localeCompare(a.created_at)),
    [rulings],
  );
  const years = useMemo(() => [...new Set(sorted.map((r) => r.year))], [sorted]);
  const shown = yearTab === "all" ? sorted : sorted.filter((r) => r.year === yearTab);
  const shownYears = [...new Set(shown.map((r) => r.year))];

  const blank: FormState = {
    title: "",
    year: state.current_year,
    entryDate: "",
    body: "",
    images: [],
  };
  const initial: FormState = editing
    ? {
        title: editing.title,
        year: editing.year,
        entryDate: editing.entry_date ?? "",
        body: editing.body ?? "",
        images: editing.images ?? [],
      }
    : blank;

  async function remove(r: Ruling) {
    if (!window.confirm(`Delete "${r.title}" from the gazette? This cannot be undone.`)) return;
    const { error } = await supabase.from("rulings").delete().eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["rulings"] });
    toast.success("Entry deleted");
  }

  return (
    <BureauShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rule-label">Official record</div>
          <h1 className="mb-6 mt-2 text-3xl font-bold text-primary">The Gazette</h1>
        </div>
        {isGm && !writing && (
          <button
            onClick={() => {
              setEditing(null);
              setWriting(true);
            }}
            className="mb-6 rounded border border-primary/50 px-3 py-2 text-sm text-primary hover:bg-primary hover:text-primary-foreground"
          >
            + New entry
          </button>
        )}
      </div>

      {isGm && writing && (
        <EntryEditor
          key={editing?.id ?? "new"}
          initial={initial}
          editing={editing}
          onDone={() => {
            setWriting(false);
            setEditing(null);
          }}
        />
      )}

      {years.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {(["all", ...years] as const).map((y) => (
            <button
              key={y}
              onClick={() => setYearTab(y)}
              className={`rounded px-3 py-1 text-xs uppercase tracking-widest ${
                yearTab === y
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {y === "all" ? "All years" : y}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {shown.length === 0 && (
          <p className="rounded border border-dashed border-border p-6 text-sm text-muted-foreground">
            No rulings entered on the register.
          </p>
        )}
        {shownYears.map((y) => (
          <section key={y}>
            {yearTab === "all" && (
              <h2 className="rule-label mb-2 border-b border-border pb-1">Year {y}</h2>
            )}
            <div className="space-y-3">
              {shown
                .filter((r) => r.year === y)
                .map((r) => (
                  <article key={r.id} className="rounded border border-border bg-card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="rule-label">
                        Year {r.year}
                        {r.entry_date ? ` · ${r.entry_date}` : ""}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rule-label">{r.status}</span>
                        {isGm && (
                          <>
                            <button
                              onClick={() => {
                                setEditing(r);
                                setWriting(true);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => remove(r)}
                              className="text-xs text-destructive hover:underline"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-primary">{r.title}</h2>
                    {r.body && <GazetteBody body={r.body} className="mt-2" />}
                    {(r.images?.length ?? 0) > 0 && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {r
                          .images!.filter((src) => safeUrl(src, true))
                          .map((src, i) => (
                            <img
                              key={i}
                              src={src}
                              alt=""
                              loading="lazy"
                              className="max-h-80 max-w-full rounded border border-border"
                            />
                          ))}
                      </div>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </BureauShell>
  );
}
