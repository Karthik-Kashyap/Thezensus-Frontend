"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Repeat, Users, EyeOff } from "lucide-react";
import type { PollListItem } from "@/lib/types";
import { getCommunity } from "@/lib/communities";
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
  // Resolve the community this poll belongs to, so the card shows its home community (not the
  // option count). React Query dedupes on ["community", id], so cards from the same community —
  // and the detail page / community header — all share one fetch. LINK polls have no community.
  const { data: community } = useQuery({
    queryKey: ["community", poll.communityId],
    queryFn: () => getCommunity(poll.communityId!),
    enabled: !!poll.communityId,
  });

  return (
    <Card className="animate-fade-up p-5 transition hover:border-primary/40 hover:shadow-md">
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
          <span>{compactNumber(poll.currentEdition.voteCount)} votes</span>
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

      {/* Vote inline — clickable options before voting, live result bars after. */}
      <div className="mt-4">
        <VotePanel poll={poll} />
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
