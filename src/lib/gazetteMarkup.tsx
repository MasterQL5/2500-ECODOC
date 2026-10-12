import { Fragment, type ReactNode } from "react";
import { Linkify } from "@/components/Linkify";

/**
 * The Gazette's small formatting language. A GM writes plain text and wraps words in tags:
 *   [b]bold[/b]  [i]italic[/i]  [u]underline stripe[/u]  [s]struck through[/s]
 *   [color=#ff0000]coloured[/color]  [hl=#ffee00]highlighted[/hl]  [censor]hidden[/censor]
 *   [url=https://example.com]link text[/url]   [img=https://example.com/pic.png]
 * Output is built as React elements, never raw HTML, and every URL and colour is validated, so
 * nothing a GM types can inject script or markup.
 */

type TagName = "b" | "i" | "u" | "s" | "color" | "hl" | "censor" | "url" | "img";
type MarkupNode = { tag: TagName | "root"; arg?: string; children: (MarkupNode | string)[] };

const TAG = /\[(\/?)(b|i|u|s|color|hl|censor|url|img)(?:=([^\]]*))?\]/gi;
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;

/** A URL that is safe to link to or embed; null when it is not. */
export function safeUrl(raw: string | undefined, allowData = false): string | null {
  const v = (raw ?? "").trim();
  if (/^https?:\/\/[^\s<>"]+$/i.test(v)) return v;
  if (allowData && DATA_IMAGE.test(v)) return v;
  return null;
}

function parse(body: string): MarkupNode {
  const root: MarkupNode = { tag: "root", children: [] };
  const stack: MarkupNode[] = [root];
  const top = () => stack[stack.length - 1]!;
  let last = 0;
  for (const m of body.matchAll(TAG)) {
    const at = m.index ?? 0;
    if (at > last) top().children.push(body.slice(last, at));
    last = at + m[0].length;
    const closing = m[1] === "/";
    const name = (m[2] ?? "").toLowerCase() as TagName;
    const arg = m[3];
    if (closing) {
      let idx = -1;
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.tag === name) {
          idx = i;
          break;
        }
      }
      if (idx > 0)
        stack.length = idx; // close it, and anything left open inside it
      else top().children.push(m[0]); // stray closing tag: show as written
    } else if (name === "img") {
      top().children.push({ tag: "img", ...(arg !== undefined ? { arg } : {}), children: [] });
    } else {
      const node: MarkupNode = { tag: name, ...(arg !== undefined ? { arg } : {}), children: [] };
      top().children.push(node);
      stack.push(node);
    }
  }
  if (last < body.length) top().children.push(body.slice(last));
  return root;
}

function textOf(node: MarkupNode | string): string {
  return typeof node === "string" ? node : node.children.map(textOf).join("");
}

/** Plain words that start with + or -, or carry ▲ / ▼, are tinted green or red, as before. */
function Plain({ text }: { text: string }) {
  if (/https?:\/\//.test(text)) {
    // Bare web addresses become links; the words around them still get the movement tint.
    return (
      <>
        {text
          .split(/(https?:\/\/[^\s<>"')]+)/)
          .map((part, i) =>
            i % 2 === 1 ? (
              <Linkify key={i} text={part} />
            ) : part ? (
              <Plain key={i} text={part} />
            ) : null,
          )}
      </>
    );
  }
  return (
    <>
      {text.split(/(\s)/).map((word, i) => {
        const m = word.match(/^([+-]?)([\d.,]+)(%|→)?$/);
        const rising = word.startsWith("+") || word.includes("▲");
        const falling = word.startsWith("-") || word.includes("▼");
        if (m && (rising || falling)) {
          return (
            <span key={i} className={rising ? "text-gain" : "text-loss"}>
              {word}
            </span>
          );
        }
        return <Fragment key={i}>{word}</Fragment>;
      })}
    </>
  );
}

function renderNode(node: MarkupNode | string, key: number): ReactNode {
  if (typeof node === "string") return <Plain key={key} text={node} />;
  const kids = node.children.map((c, i) => renderNode(c, i));
  switch (node.tag) {
    case "b":
      return <strong key={key}>{kids}</strong>;
    case "i":
      return <em key={key}>{kids}</em>;
    case "u":
      return (
        <span key={key} className="underline decoration-2 underline-offset-4">
          {kids}
        </span>
      );
    case "s":
      return (
        <span key={key} className="line-through decoration-2">
          {kids}
        </span>
      );
    case "color":
      return node.arg && COLOR.test(node.arg) ? (
        <span key={key} style={{ color: node.arg }}>
          {kids}
        </span>
      ) : (
        <Fragment key={key}>{kids}</Fragment>
      );
    case "hl":
      return node.arg && COLOR.test(node.arg) ? (
        <span
          key={key}
          className="rounded px-0.5"
          style={{ backgroundColor: node.arg, color: "#111" }}
        >
          {kids}
        </span>
      ) : (
        <Fragment key={key}>{kids}</Fragment>
      );
    case "censor": {
      // The hidden words are never put on the page: only same-length blocks are.
      const blocks = textOf(node).replace(/[^\s]/g, "█");
      return (
        <span
          key={key}
          className="select-none text-foreground"
          title="Censored"
          aria-label="censored"
        >
          {blocks || "████"}
        </span>
      );
    }
    case "url": {
      const href = safeUrl(node.arg);
      return href ? (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline hover:text-blue-400"
        >
          {kids}
        </a>
      ) : (
        <Fragment key={key}>{kids}</Fragment>
      );
    }
    case "img": {
      const src = safeUrl(node.arg, true);
      return src ? (
        <img
          key={key}
          src={src}
          alt=""
          loading="lazy"
          className="my-2 block max-h-96 max-w-full rounded border border-border"
        />
      ) : null;
    }
    default:
      return <Fragment key={key}>{kids}</Fragment>;
  }
}

/** A formatted Gazette body. */
export function GazetteBody({ body, className = "" }: { body: string; className?: string }) {
  const tree = parse(body);
  return (
    <div className={`whitespace-pre-line text-sm text-muted-foreground ${className}`}>
      {tree.children.map((c, i) => renderNode(c, i))}
    </div>
  );
}

/** The body with every formatting tag removed, for short previews. */
export function stripMarkup(body: string): string {
  return body.replace(TAG, "");
}
