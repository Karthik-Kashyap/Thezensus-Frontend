// Open Graph share-card constants — the social preview image generated for a poll (next/og).
// 1200×630 is the universal OG / Twitter "large image" size. Colors are literal hsl() strings
// because Satori (the next/og renderer) has no CSS-variable context — these mirror the design
// tokens in app/globals.css; keep them in sync if the palette changes.

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";
export const OG_ALT = "A poll on Thezensus";

/** Literal mirrors of the :root design tokens (globals.css). Satori can't read CSS vars. */
export const OG = {
  bg: "hsl(240, 20%, 99%)",
  card: "hsl(0, 0%, 100%)",
  fg: "hsl(230, 25%, 12%)",
  muted: "hsl(232, 12%, 46%)",
  primary: "hsl(245, 75%, 58%)",
  secondary: "hsl(8, 88%, 64%)",
  accent: "hsl(245, 60%, 96%)",
  accentFg: "hsl(245, 75%, 40%)",
  border: "hsl(240, 16%, 90%)",
  track: "hsl(240, 18%, 95%)",
} as const;

/** Layout caps so long content never overflows the fixed 1200×630 frame. */
export const OG_MAX = {
  questionChars: 140,
  optionLabelChars: 42,
  optionsShown: 5,
} as const;

/** Brand tagline for the generic (private / link / not-found) card. */
export const OG_TAGLINE = "Settle anything. Ask everyone.";
