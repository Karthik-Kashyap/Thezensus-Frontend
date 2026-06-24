// Server shell for the poll page. It exists as a server component (not "use client") so it can
// supply per-poll metadata: generateMetadata gives a pasted link a poll-specific title,
// description, and preview card (og:image / twitter:image) in social unfurls (crawlers read the
// static <head> and don't run JS). The image is the /card route in fixed social size — config-
// based rather than a file-based opengraph-image, because only a route handler can read the
// `?edition` param so a shared edition link unfurls with that edition. The interactive view stays
// a client island — PollDetailView still subscribes live with the viewer's auth and the LINK token.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { PollDetailView } from "@/components/poll/PollDetailView";
import { fetchPublicPoll } from "@/lib/og/fetchPoll";
import { OG_ALT, OG_SIZE } from "@/lib/og/constants";

type Params = Promise<{ pollId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Absolute origin from the request headers — so og:image resolves correctly in every
 *  environment without a configured metadataBase (this page is already dynamic). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  const { pollId } = await params;
  // Edition-aware: a shared `?edition=` link unfurls with that edition's results, not the live one.
  const edition = firstParam((await searchParams).edition);
  const poll = await fetchPublicPoll(pollId, edition);

  // Private / LINK / missing → generic, non-leaking metadata (the OG image renders generic too).
  if (!poll) {
    return { title: "Poll · Pollzens", description: "Vote on a poll on Pollzens." };
  }

  const votes = poll.currentEdition.voteCount;
  const reveal = poll.shareCardShowResults !== false && votes > 0;
  const description = reveal
    ? `${votes.toLocaleString()} vote${votes === 1 ? "" : "s"} so far — cast yours on Pollzens.`
    : "Cast your vote on Pollzens.";

  // OG/Twitter image is the /card route in fixed social size (og=1), carrying the same edition —
  // built as an absolute URL since there's no metadataBase. Config-based (not file-based
  // opengraph-image) precisely because the file convention can't read the `?edition` param.
  const origin = await requestOrigin();
  const imageUrl =
    `${origin}/poll/${encodeURIComponent(pollId)}/card?og=1` +
    (edition ? `&edition=${encodeURIComponent(edition)}` : "");
  const images = [{ url: imageUrl, width: OG_SIZE.width, height: OG_SIZE.height, alt: OG_ALT }];

  return {
    title: `${poll.question} · Pollzens`,
    description,
    openGraph: { title: poll.question, description, type: "website", images },
    twitter: { card: "summary_large_image", title: poll.question, description, images },
  };
}

export default async function PollPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { pollId } = await params;
  const sp = await searchParams;
  const token = firstParam(sp.token);
  // Deep-link to a specific edition (the share dialog's edition picker) — the ballot opens there.
  const edition = firstParam(sp.edition);
  return <PollDetailView pollId={pollId} token={token} edition={edition} />;
}
