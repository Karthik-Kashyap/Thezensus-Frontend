// Server shell for the poll page. It exists as a server component (not "use client") so it can
// supply per-poll metadata: generateMetadata + the sibling opengraph-image/twitter-image give a
// pasted link a poll-specific title, description, and preview card in social unfurls (crawlers
// read the static <head> and don't run JS). The interactive view stays a client island —
// PollDetailView still subscribes live with the viewer's auth and the LINK token.

import type { Metadata } from "next";
import { PollDetailView } from "@/components/poll/PollDetailView";
import { fetchPublicPoll } from "@/lib/og/fetchPoll";

type Params = Promise<{ pollId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { pollId } = await params;
  const poll = await fetchPublicPoll(pollId);

  // Private / LINK / missing → generic, non-leaking metadata (the OG image renders generic too).
  if (!poll) {
    return { title: "Poll · Thezensus", description: "Vote on a poll on Thezensus." };
  }

  const votes = poll.currentEdition.voteCount;
  const reveal = poll.shareCardShowResults !== false && votes > 0;
  const description = reveal
    ? `${votes.toLocaleString()} vote${votes === 1 ? "" : "s"} so far — cast yours on Thezensus.`
    : "Cast your vote on Thezensus.";

  return {
    title: `${poll.question} · Thezensus`,
    description,
    openGraph: { title: poll.question, description, type: "website" },
    twitter: { card: "summary_large_image", title: poll.question, description },
  };
}

export default async function PollPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { pollId } = await params;
  const token = firstParam((await searchParams).token);
  return <PollDetailView pollId={pollId} token={token} />;
}
