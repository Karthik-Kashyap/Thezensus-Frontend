"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useQuery as useConvexQuery } from "convex/react";
import { MessageSquare, Repeat, Users, EyeOff } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { PollListItem } from "@/lib/types";
import { getCommunity } from "@/lib/communities";
import { useLiveSlot } from "@/components/feed/LiveSlotProvider";
import { useSession } from "@/lib/session";
import { routes } from "@/lib/constants";
import { relativeTime, compactNumber } from "@/lib/format";
import { ANONYMOUS_HINT, recurrenceHint } from "@/lib/pollHints";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/common/InfoHint";
import { SubscribeButton } from "@/components/community/SubscribeButton";
import { VotePanel } from "./VotePanel";
import { PollImage } from "./PollImage";
import { VoteCount } from "./VoteCount";

/**
 * A poll in a feed — votable in place: the options are clickable and casting shows live results
 * (the same VotePanel the detail page uses), so you never have to leave the feed to vote. The
 * question and the comment count still link through to the full detail page for the discussion.
 */
export function PollCard({
  poll,
  showJoinCta = false,
}: {
  poll: PollListItem;
  /** Onboarding nudge: show a "Join" button for the poll's community (new users only). */
  showJoinCta?: boolean;
}) {
  const { user } = useSession();

  // Live vote counts while this card is on screen (DESIGN-010): the slot manager grants a
  // subscription only after the card dwells and stays within the 4-card cap (or it's pinned
  // by the viewer's own vote). Off-screen / over-cap → isLive false → "skip" → no subscription,
  // and the card renders its feed snapshot exactly as before. We overlay the live counts onto
  // the snapshot so there's never a blank state before the first push.
  const { ref: liveRef, isLive, onVoted } = useLiveSlot(poll.pollId);
  const liveCounts = useConvexQuery(
    api.polls.editionCounts,
    isLive ? { pollId: poll.pollId } : "skip",
  );
  const currentEdition = liveCounts
    ? {
        ...poll.currentEdition,
        voteCount: liveCounts.voteCount,
        optionCounts: liveCounts.optionCounts,
        // publishedAt is only present once the tally has published — `in` narrows the
        // optional field so we don't clobber the snapshot's value before the first push.
        ...("publishedAt" in liveCounts ? { publishedAt: liveCounts.publishedAt } : {}),
      }
    : poll.currentEdition;
  const livePoll = { ...poll, currentEdition };

  // Resolve the community this poll belongs to, so the card shows its home community (not the
  // option count). React Query dedupes on ["community", id], so cards from the same community —
  // and the detail page / community header — all share one fetch. LINK polls have no community.
  const { data: community } = useQuery({
    queryKey: ["community", poll.communityId],
    queryFn: () => getCommunity(poll.communityId!),
    enabled: !!poll.communityId,
  });

  return (
    <Card ref={liveRef} className="animate-fade-up p-5 transition hover:border-primary/40 hover:shadow-md">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        {poll.communityId ? (
          <Link
            href={routes.community(poll.communityId)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:underline"
          >
            <Users className="h-4 w-4" />
            {community?.name ?? "Community"}
          </Link>
        ) : (
          <Badge variant="outline">Shared link</Badge>
        )}
        {poll.recurrence !== "NONE" && (
          <InfoHint content={recurrenceHint(poll.recurrence, poll.recurrenceStart, poll.recurrenceEnd)}>
            <span className="inline-flex items-center gap-1 capitalize">
              <Repeat className="h-3 w-3" /> {poll.recurrence.toLowerCase()}
            </span>
          </InfoHint>
        )}
        {poll.status === "CLOSED" && <Badge variant="outline">Closed</Badge>}
        {poll.ballotMode === "anonymous" && (
          <InfoHint content={ANONYMOUS_HINT}>
            <Badge variant="outline" className="gap-1">
              <EyeOff className="h-3 w-3" /> Anonymous
            </Badge>
          </InfoHint>
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          <VoteCount count={livePoll.currentEdition.voteCount} />
          <span aria-hidden className="opacity-50">·</span>
          <span>{relativeTime(poll.createdAt)}</span>
        </span>
        {showJoinCta && poll.communityId && community && (
          <SubscribeButton
            communityId={poll.communityId}
            communityName={community.name}
            segments={community.segments}
          />
        )}
      </div>

      <Link href={routes.poll(poll.pollId)} className="group block">
        <h3 className="font-display text-lg font-semibold leading-snug tracking-tight transition group-hover:text-primary">
          {poll.question}
        </h3>
      </Link>
      <Link
        href={routes.profile(poll.creatorId)}
        className="mt-1 inline-block text-xs text-muted-foreground transition hover:text-foreground"
      >
        by {poll.creatorDisplayName ?? poll.creatorId.slice(0, 8)}
      </Link>

      <PollImage
        mediaId={poll.questionMediaId}
        mediaKey={poll.questionMediaKey}
        ownerId={poll.creatorId}
        isSelf={user?.linkId === poll.creatorId}
        alt={poll.question}
        className="mt-3 max-h-72 w-full rounded-lg border"
      />

      {/* Vote inline — clickable options before voting, live result bars after. When this card
          holds a live slot, results stream in; voting also pins the card (onVoted) so the voter
          keeps watching even if it's not one of the top cards. */}
      <div className="mt-4">
        <VotePanel poll={livePoll} liveResults={isLive} onVoted={onVoted} />
      </div>

      <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
        <Link
          href={routes.poll(poll.pollId)}
          className="inline-flex items-center gap-1 transition hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {compactNumber(poll.commentCount)}
          {poll.commentCountCapped ? "+" : ""}
        </Link>
      </div>
    </Card>
  );
}
