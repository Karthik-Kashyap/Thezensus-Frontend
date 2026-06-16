// Per-poll social share card (Open Graph image). Next renders this for /poll/<id>/opengraph-image
// and injects the URL as og:image, so a pasted poll link unfurls with a branded preview in
// iMessage / Discord / Slack / Twitter etc. — none of which run JS, which is why this lives
// server-side. Fixed 1200×630 (the aspect ratio social cards expect); the option list is capped
// (+N more) to fit. The in-app downloadable variant (taller, all options) is poll/[id]/card.
//
// Privacy: the poll is fetched anonymously (fetchPublicPoll), so private / LINK polls come back
// null and render the generic branded card — no question or results leak into this public,
// guessable endpoint. Rendering lives in lib/og/card (shared with the /card route).

import { ImageResponse } from "next/og";
import { fetchPublicPoll } from "@/lib/og/fetchPoll";
import { genericCardElement, pollCardElement } from "@/lib/og/card";
import { OG_ALT, OG_CONTENT_TYPE, OG_MAX, OG_SIZE } from "@/lib/og/constants";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await params;
  const poll = await fetchPublicPoll(pollId);
  return new ImageResponse(poll ? pollCardElement(poll, OG_MAX.optionsShown) : genericCardElement(), { ...size });
}
