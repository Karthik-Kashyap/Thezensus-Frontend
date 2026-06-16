import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Poll } from "@/lib/types";

// A request/response Convex client for SERVER rendering only (generateMetadata + the OG image
// route). Deliberately UNAUTHENTICATED and token-less: it calls polls.get with no actor and no
// share token, so canViewPoll returns null for anything not publicly viewable. That means the
// public, guessable OG endpoint can never leak a private or LINK poll's question/results — the
// existing access-control invariant does the privacy work for us. The interactive page still
// subscribes live with the viewer's auth (and token for LINK polls) via PollDetailView.

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

/** Fetch a poll for share-card rendering, or null if it isn't publicly viewable / doesn't exist. */
export async function fetchPublicPoll(pollId: string): Promise<Poll | null> {
  if (!client) return null;
  try {
    return (await client.query(api.polls.get, { pollId })) as Poll | null;
  } catch {
    return null;
  }
}
