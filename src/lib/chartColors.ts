/**
 * Colour helpers for the dossier charts. Everything here works in plain hex so the same value can
 * be stored in the database, fed to an <input type="color">, and painted straight into SVG.
 */

/** Categorical palette, tuned to sit with the sheet's gold / cyan / green theme on a dark ground.
 * Red is deliberately kept out of it: it is reserved for debt, which is always a "loss" colour. */
export const CATEGORY_PALETTE = [
  "#e3b04b", // gold
  "#4fb8c9", // cyan
  "#4fd08a", // green
  "#a98bdd", // violet
  "#e38a4b", // orange
  "#5b8def", // blue
  "#d86fa8", // rose
  "#3fbfa5", // teal
  "#a8c94a", // lime
  "#c9a07a", // sand
] as const;

export const DEBT_COLOR = "#e5575a";
export const FOREIGN_TAX_COLOR = "#9b7ed9";
export const NEUTRAL_COLOR = "#7c8da6";

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** `n` gradients of one colour, lightest first. One item gets the colour itself. The lightness
 * range is kept inside what stays legible on the dark card, so even a pale or dark pick works. */
export function shadesOf(base: string, n: number): string[] {
  if (!isHexColor(base)) base = NEUTRAL_COLOR;
  if (n <= 1) return [base];
  const [h, s, l] = hexToHsl(base);
  const hi = Math.min(0.8, Math.max(l, 0.5) + 0.16);
  const lo = Math.max(0.3, Math.min(l, 0.58) - 0.2);
  return Array.from({ length: n }, (_, i) => hslToHex(h, s, hi - ((hi - lo) * i) / (n - 1)));
}

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * A colour for every category: the one the nation picked if there is one, otherwise a stable
 * palette colour (seeded by the category's name, nudged along if another category already took
 * it) so colours don't jump around when lines are added or moved.
 */
export function resolveCategoryColors(
  categories: string[],
  saved: Record<string, string>,
  fixed: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const c of categories) {
    const pick = saved[c] ?? fixed[c];
    if (isHexColor(pick)) {
      out[c] = pick.toLowerCase();
      used.add(out[c]);
    }
  }
  for (const c of categories) {
    if (out[c]) continue;
    if (fixed[c]) {
      out[c] = fixed[c]!;
      continue;
    }
    const start = hash(c) % CATEGORY_PALETTE.length;
    let color: string = CATEGORY_PALETTE[start]!;
    for (let k = 0; k < CATEGORY_PALETTE.length; k++) {
      const candidate = CATEGORY_PALETTE[(start + k) % CATEGORY_PALETTE.length]!;
      if (!used.has(candidate)) {
        color = candidate;
        break;
      }
    }
    out[c] = color;
    used.add(color);
  }
  return out;
}

/** Distinct colours for an ordered list of independent items (the revenue streams). Past the end
 * of the palette it wraps round with a darker tint so neighbours stay apart. */
export function seriesColors(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const base = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!;
    const lap = Math.floor(i / CATEGORY_PALETTE.length);
    if (lap === 0) return base;
    const [h, s, l] = hexToHsl(base);
    return hslToHex(h, s, Math.max(0.3, l - 0.14 * lap));
  });
}
