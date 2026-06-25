"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useQuery as useConvexQuery } from "convex/react";
import { Repeat, EyeOff } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Poll } from "@/lib/types";
import { getCommunity } from "@/lib/communities";
import { useSession } from "@/lib/session";
import { routes } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import { ANONYMOUS_HINT, recurrenceHint } from "@/lib/pollHints";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/common/InfoHint";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PollBallot } from "./PollBallot";
import { PollImage } from "./PollImage";
import { ShareButton } from "./ShareButton";
import { DeletePollButton } from "./DeletePollButton";
import { EditPollButton } from "./EditPollButton";
import { VoteCount } from "./VoteCount";
import { NextEditionCountdown } from "./NextEditionCountdown";
import { AnalyticsStub } from "./AnalyticsStub";
import { SlicePanel } from "./SlicePanel";
import { CommentsSection } from "@/components/comment/CommentsSection";
import { ReportButton } from "@/components/moderation/ReportDialog";
import { PageContainer } from "@/components/layout/PageContainer";

export function PollDetailView({
  pollId,
  token,
  edition,
}: {
  pollId: string;
  token?: string;
  /** Optional deep-link target edition (from a shared `?edition=` link). */
  edition?: string;
}) {
  const { user } = useSession();

  // LIVE subscription (the 5s re-poll is gone): Convex pushes a new snapshot whenever
  // the tally publishes fresh counts — at most once per publish interval, however hot
  // the poll. undefined = loading, null = not found / not visible.
  const poll = useConvexQuery(api.polls.get, { pollId, token }) as Poll | null | undefined;
  const isLoading = poll === undefined;

  // Community context (name + link) when this is a community poll.
  const { data: community } = useQuery({
    queryKey: ["community", poll?.communityId],
    queryFn: () => getCommunity(poll!.communityId!),
    enabled: !!poll?.communityId,
  });

  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </PageContainer>
    );
  }

  if (!poll) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Poll not found</h1>
        <p className="mt-2 text-muted-foreground">
          This poll may be private, deleted, or the link is missing its token.
        </p>
      </div>
    );
  }

  const isCreator = user?.linkId === poll.creatorId;
  // Creator or a community owner/mod may edit/close/delete (mirrors canEditPoll on the backend,
  // which the update/remove mutations re-check). myRole is present on the community DTO only for
  // owners/mods.
  const canManage = isCreator || community?.myRole === "OWNER" || community?.myRole === "MODERATOR";

  return (
    <PageContainer>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {community ? (
          <Link href={routes.community(community.communityId)} className="font-medium text-primary hover:underline">
            {community.name}
          </Link>
        ) : (
          <Badge variant="outline">Shared link</Badge>
        )}
        <span>·</span>
        <Link href={routes.profile(poll.creatorId)} className="hover:text-foreground">
          {poll.creatorHandle ?? poll.creatorId.slice(0, 12)}
        </Link>
        <span>·</span>
        <span>{relativeTime(poll.createdAt)}</span>
        <span>·</span>
        <VoteCount count={poll.currentEdition.voteCount} className="font-medium text-foreground" />
        {poll.recurrence !== "NONE" && (
          <InfoHint content={recurrenceHint(poll.recurrence, poll.recurrenceStart, poll.recurrenceEnd)}>
            <Badge variant="outline" className="gap-1">
              <Repeat className="h-3 w-3" /> {poll.currentEdition.label}
            </Badge>
          </InfoHint>
        )}
        {poll.status !== "CLOSED" && poll.currentEdition.nextEditionAt !== undefined && (
          <NextEditionCountdown at={poll.currentEdition.nextEditionAt} />
        )}
        {poll.status === "CLOSED" && <Badge variant="outline">Closed</Badge>}
        {poll.ballotMode === "anonymous" && (
          <InfoHint content={ANONYMOUS_HINT}>
            <Badge variant="outline" className="gap-1">
              <EyeOff className="h-3 w-3" /> Anonymous
            </Badge>
          </InfoHint>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Shareable = anything publicly viewable: every LINK poll, and any community poll
              that isn't private (a private poll's link only resolves for members). The link
              unfurls with the generated OG card (page generateMetadata → /card?og=1). */}
          {!(poll.audienceType === "COMMUNITY" && poll.visibility === "private") && (
            <ShareButton
              pollId={poll.pollId}
              token={poll.audienceType === "LINK" ? poll.shareToken ?? token : undefined}
              recurrence={poll.recurrence}
              canShareImage={poll.audienceType === "COMMUNITY" && poll.visibility !== "private"}
              optionCount={poll.options.length}
              imageShowsResults={poll.shareCardShowResults !== false && poll.currentEdition.voteCount > 0}
            />
          )}
          {user && !isCreator && (
            <ReportButton
              targetType="POLL"
              targetId={poll.pollId}
              communityId={poll.communityId}
              label="Report"
              variant="inline"
            />
          )}
          {canManage && <EditPollButton poll={poll} />}
          {canManage && <DeletePollButton pollId={poll.pollId} communityId={poll.communityId} />}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-5">
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight">
            {poll.question}
          </h1>
          <PollImage
            mediaId={poll.questionMediaId}
            mediaKey={poll.questionMediaKey}
            ownerId={poll.creatorId}
            isSelf={isCreator}
            alt={poll.question}
            className="max-h-96 w-full rounded-xl border"
          />
          <PollBallot poll={poll} token={token} initialEdition={edition} />
        </CardContent>
      </Card>

      {poll.segmentSchema && poll.segmentSchema.length > 0 && (
        <div className="mt-6">
          <SlicePanel poll={poll} token={token} />
        </div>
      )}

      {isCreator && (
        <div className="mt-6">
          <AnalyticsStub />
        </div>
      )}

      <CommentsSection pollId={poll.pollId} token={token} />
    </PageContainer>
  );
}
