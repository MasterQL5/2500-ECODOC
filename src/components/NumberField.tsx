import { useState } from "react";

/**
 * A numeric input that lets you actually type "0.05" one character at a time. A plain
 * `<input type="number" value={String(n)}>` re-derives its displayed text from the parsed
 * number on every keystroke — so deleting the "7" in "0.07" leaves "0.0", which parses to 0,
 * which re-renders as "0", destroying the leading zero you needed to keep typing a smaller
 * decimal. This input keeps its own raw text while focused and only commits a parsed number on
 * blur or Enter.
 */
export function NumberField({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  function commit() {
    setFocused(false);
    const n = Number(draft);
    if (Number.isFinite(n)) {
      onCommit(n);
    } else {
      setDraft(String(value));
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? draft : String(value)}
      onFocus={() => {
        setDraft(String(value));
        setFocused(true);
      }}
      onChange={(e) => {
        // Only accept characters that could be part of a valid (possibly incomplete) number,
        // so stray letters can't sneak in, while "0.0", "-", "5." etc. remain typeable.
        if (/^-?\d*\.?\d*$/.test(e.target.value)) setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
