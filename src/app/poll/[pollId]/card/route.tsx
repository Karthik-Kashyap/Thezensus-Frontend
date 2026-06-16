// In-app downloadable share image: GET /poll/<id>/card?count=N. Unlike the social og:image
// (fixed 1200×630), this grows in height so the user can render as many options as they want
// (?count, default 8, min 1, capped at the poll's option count). Driven by the share modal's
// "options shown" input. Same anonymous fetch + generic-fallback privacy rules as opengraph-image.

import { ImageResponse } from "next/og";
import { fetchPublicPoll } from "@/lib/og/fetchPoll";
import { cardImageHeight, genericCardElement, pollCardElement } from "@/lib/og/card";
import { OG_SIZE } from "@/lib/og/constants";

export const runtime = "nodejs";

const DEFAULT_COUNT = 8;

export async function GET(request: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await params;
  const poll = await fetchPublicPoll(pollId);

  if (!poll) {
    return new ImageResponse(genericCardElement(), { width: OG_SIZE.width, height: OG_SIZE.height });
  }

  const raw = Number(new URL(request.url).searchParams.get("count"));
  const requested = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_COUNT;
  const count = Math.min(requested, poll.options.length); // can't show more options than exist

  return new ImageResponse(pollCardElement(poll, count), {
    width: OG_SIZE.width,
    height: cardImageHeight(poll, count),
  });
}
