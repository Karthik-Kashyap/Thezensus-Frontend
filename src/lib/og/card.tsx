// Shared renderer for the poll share-card image (next/og / Satori). Two endpoints use it:
//   • opengraph-image.tsx — the social unfurl: fixed 1200×630, option list capped (+N more),
//     because chat/social cards expect that aspect ratio.
//   • poll/[pollId]/card/route.tsx — the in-app downloadable image: height grows with the
//     chosen option count (cardImageHeight) so the user can render every option.
//
// Satori constraints: flexbox only; any box with >1 child must set display:flex; a text node
// must be a single child (so percentages/counts are pre-joined into one string); colors are
// literal hsl (no CSS vars). Keep these in mind when editing.

import type { ReactElement, ReactNode } from "react";
import { OG, OG_MAX, OG_SIZE, OG_TAGLINE } from "@/lib/og/constants";
import type { Poll } from "@/lib/types";

const BAR_OTHER = "hsl(245, 65%, 83%)";

function clamp(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Top options by vote share, highest-first, capped to maxOptions. */
function rankedOptions(poll: Poll, maxOptions: number) {
  const { optionCounts, voteCount } = poll.currentEdition;
  return poll.options
    .map((o) => ({ label: o.label, count: optionCounts[o.id] ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(1, maxOptions))
    .map((o) => ({ ...o, pct: voteCount ? Math.round((o.count / voteCount) * 100) : 0 }));
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: OG.primary }} />
      <div style={{ fontSize: 30, fontWeight: 700, color: OG.fg, letterSpacing: -0.5 }}>Thezensus</div>
    </div>
  );
}

function Eyebrow({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "8px 18px",
        borderRadius: 999,
        background: OG.accent,
        color: OG.accentFg,
        fontSize: 24,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
}

function ResultBars({ poll, maxOptions }: { poll: Poll; maxOptions: number }) {
  const rows = rankedOptions(poll, maxOptions);
  const extra = poll.options.length - rows.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 27, fontWeight: i === 0 ? 700 : 500, color: OG.fg }}>
              {clamp(r.label, OG_MAX.optionLabelChars)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 21, fontWeight: 500, color: OG.muted }}>
                {`${r.count.toLocaleString()} ${r.count === 1 ? "vote" : "votes"}`}
              </div>
              <div style={{ fontSize: 27, fontWeight: 700, color: i === 0 ? OG.primary : OG.muted }}>
                {`${r.pct}%`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", width: "100%", height: 15, borderRadius: 999, background: OG.track }}>
            <div
              style={{
                width: `${Math.max(r.pct, 2)}%`,
                height: 15,
                borderRadius: 999,
                background: i === 0 ? OG.primary : BAR_OTHER,
              }}
            />
          </div>
        </div>
      ))}
      {extra > 0 && (
        <div style={{ display: "flex", fontSize: 22, color: OG.muted }}>
          {`+${extra} more option${extra === 1 ? "" : "s"}`}
        </div>
      )}
    </div>
  );
}

function VoteCta() {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        padding: "16px 32px",
        borderRadius: 999,
        background: OG.primary,
        color: "white",
        fontSize: 32,
        fontWeight: 700,
      }}
    >
      Tap to vote →
    </div>
  );
}

/** Shell shared by every variant: brand header, body (fills the frame), footer. */
function Frame({ eyebrow, children, footer }: { eyebrow: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 64,
        background: OG.bg,
        backgroundImage: `linear-gradient(135deg, ${OG.accent} 0%, ${OG.bg} 45%)`,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        <Eyebrow text={eyebrow} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 32 }}>
        {children}
      </div>
      <div style={{ display: "flex", color: OG.muted, fontSize: 26 }}>{footer}</div>
    </div>
  );
}

/** The content card for a publicly-viewable poll, showing up to `maxOptions` result bars. */
export function pollCardElement(poll: Poll, maxOptions: number): ReactElement {
  const votes = poll.currentEdition.voteCount;
  const reveal = poll.shareCardShowResults !== false && votes > 0;
  const eyebrow = poll.tags?.[0] ? `#${poll.tags[0]}` : "Poll";
  return (
    <Frame
      eyebrow={eyebrow}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex" }}>thezensus.com</div>
          <div style={{ display: "flex", fontWeight: 600, color: OG.fg }}>
            {votes > 0 ? `${votes.toLocaleString()} vote${votes === 1 ? "" : "s"}` : "Be the first to vote"}
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: OG.fg, lineHeight: 1.1, letterSpacing: -1 }}>
        {clamp(poll.question, OG_MAX.questionChars)}
      </div>
      {reveal ? <ResultBars poll={poll} maxOptions={maxOptions} /> : <VoteCta />}
    </Frame>
  );
}

/** The generic card for private / link / not-found polls (no content leak). */
export function genericCardElement(): ReactElement {
  return (
    <Frame eyebrow="Poll" footer={<div style={{ display: "flex" }}>thezensus.com</div>}>
      <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: OG.fg, lineHeight: 1.1, letterSpacing: -1 }}>
        {OG_TAGLINE}
      </div>
      <div style={{ display: "flex", fontSize: 34, color: OG.muted }}>Vote on a poll on Thezensus.</div>
    </Frame>
  );
}

/**
 * Pixel height for the dynamic in-app card so all `maxOptions` rows fit (the social card is
 * always fixed-height; this is only for the downloadable image). Estimates question wrap +
 * per-row height with slack; floored at the standard card height so few-option images still
 * look like a normal card. Overestimates slightly — better a little bottom padding than a clip.
 */
export function cardImageHeight(poll: Poll, maxOptions: number): number {
  const votes = poll.currentEdition.voteCount;
  const reveal = poll.shareCardShowResults !== false && votes > 0;
  if (!reveal) return OG_SIZE.height; // CTA card — fixed height

  const rows = rankedOptions(poll, maxOptions);
  const extra = poll.options.length - rows.length;
  const q = clamp(poll.question, OG_MAX.questionChars);
  const qLines = Math.min(5, Math.max(1, Math.ceil(q.length / 30)));
  const questionH = qLines * 70; // fontSize 60, generous line height
  const rowsH = rows.length * 52 + Math.max(0, rows.length - 1) * 14 + (extra > 0 ? 34 : 0);
  const PADDING = 128;
  const HEADER = 44;
  const FOOTER = 44;
  const BODY_GAP = 32;
  const SLACK = 24;
  return Math.max(OG_SIZE.height, Math.round(PADDING + HEADER + FOOTER + BODY_GAP + questionH + rowsH + SLACK));
}
