import { Fragment, type ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/g;
const URL_ONLY = /^https?:\/\/[^\s<>"')]+$/;
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * Renders plain text, but any http(s) URL inside it becomes a real clickable link (opened in a
 * new tab), styled blue and underlined so it visibly reads as a link rather than ordinary text.
 * Two forms are recognised: a bare URL ("https://example.com") shows the URL itself as the link
 * text; a markdown-style link ("[the constitution](https://example.com)") shows the bracketed
 * text as the link instead, for when the raw URL shouldn't be the visible label. Everything
 * else is rendered exactly as given — this never interprets any other markdown or HTML.
 */
export function Linkify({ text }: { text: string }) {
  // First split out markdown-style links, then run the plain-URL pass over whatever's left
  // between them, so a mix of both forms in the same string works correctly.
  const segments = text.split(MARKDOWN_LINK);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i % 3 === 0) {
      // Plain text segment (may itself contain bare URLs) — sub-split it.
      const plain = segments[i] ?? "";
      const parts = plain.split(URL_PATTERN);
      parts.forEach((part, j) => {
        if (URL_ONLY.test(part)) {
          nodes.push(
            <a
              key={`${i}-${j}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline hover:text-blue-400"
            >
              {part}
            </a>,
          );
        } else if (part) {
          nodes.push(<Fragment key={`${i}-${j}`}>{part}</Fragment>);
        }
      });
    } else if (i % 3 === 1) {
      // The bracketed link text; the URL itself is the next segment (i % 3 === 2).
      const label = segments[i];
      const url = segments[i + 1];
      nodes.push(
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline hover:text-blue-400"
        >
          {label}
        </a>,
      );
    }
    // i % 3 === 2 is the URL already consumed above — skip it here.
  }
  return <>{nodes}</>;
}
