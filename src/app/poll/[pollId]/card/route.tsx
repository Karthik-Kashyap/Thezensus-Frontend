// Poll share-card image: GET /poll/<id>/card. Two modes:
//   • ?og=1 — the social unfurl (og:image / twitter:image): fixed 1200×630, capped option list.
//   • ?count=N — the in-app downloadable image: grows in height so the user can render as many
//     options as they want (default 8, min 1, capped at the poll's option count), driven by the
//     share modal's "options shown" input.
// Both accept ?edition=<label> to render a past edition. Privacy: fetchPublicPoll is anonymous +
// token-less, so private / LINK polls come back null and render the generic branded card.

import { ImageResponse } from "next/og";
import { fetchPublicPoll } from "@/lib/og/fetchPoll";
import { cardImageHeight, genericCardElement, pollCardElement } from "@/lib/og/card";
import { OG_MAX, OG_SIZE } from "@/lib/og/constants";

export const runtime = "nodejs";

const DEFAULT_COUNT = 8;

export async function GET(request: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await params;
  const searchParams = new URL(request.url).searchParams;
  // Optional: render a specific past edition's results (the share dialog's edition picker).
  const edition = searchParams.get("edition") ?? undefined;
  const poll = await fetchPublicPoll(pollId, edition);

  if (!poll) {
    return new ImageResponse(genericCardElement(), { width: OG_SIZE.width, height: OG_SIZE.height });
  }

  // `og=1` → the social-unfurl variant: fixed 1200×630 with a capped option list (what
  // generateMetadata points og:image / twitter:image at). Otherwise the in-app downloadable
  // image: grows in height so every chosen option (?count) fits.
  if (searchParams.get("og") === "1") {
    return new ImageResponse(pollCardElement(poll, OG_MAX.optionsShown), {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
    });
  }

  const raw = Number(searchParams.get("count"));
  const requested = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_COUNT;
  const count = Math.min(requested, poll.options.length); // can't show more options than exist

  return new ImageResponse(pollCardElement(poll, count), {
    width: OG_SIZE.width,
    height: cardImageHeight(poll, count),
  });
}
