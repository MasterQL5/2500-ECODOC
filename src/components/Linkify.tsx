import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/g;
const URL_ONLY = /^https?:\/\/[^\s<>"')]+$/;

/**
 * Renders plain text, but any http(s) URL inside it becomes a real clickable link (opened in a
 * new tab), styled blue and underlined so it visibly reads as a link rather than ordinary text.
 * Everything else is rendered exactly as given — this never interprets markdown or HTML, only
 * bare URLs.
 */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        URL_ONLY.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline hover:text-blue-400"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
