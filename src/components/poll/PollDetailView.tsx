"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { getPoll } from "@/lib/polls";
import { getCommunity } from "@/lib/communities";
import { useSession } from "@/lib/session";
import { routes } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { VotePanel } from "./VotePanel";
import { ShareButton } from "./ShareButton";
import { AnalyticsStub } from "./AnalyticsStub";
import { CommentsSection } from "@/components/comment/CommentsSection";

export function PollDetailView({ pollId, token }: { pollId: string; token?: string }) {
  const { user } = useSession();

  const { data: poll, isLoading, error } = useQuery({
    queryKey: ["poll", pollId, token ?? null],
    queryFn: () => getPoll(pollId, token),
    // Live-ish counts (no websockets yet): re-poll while the tab is focused.
    refetchInterval: 5000,
  });

  // Community context (name + link) when this is a community poll.
  const { data: community } = useQuery({
    queryKey: ["community", poll?.communityId],
    queryFn: () => getCommunity(poll!.communityId!),
    enabled: !!poll?.communityId,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !poll) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Poll not found</h1>
        <p className="mt-2 text-muted-foreground">
          This poll may be private, deleted, or the link is missing its token.
        </p>
      </div>
    );
  }

  const isCreator = user?.userId === poll.creatorId;

  return (
    <div className="mx-auto max-w-2xl">
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
          {poll.creatorId.slice(0, 12)}
        </Link>
        <span>·</span>
        <span>{relativeTime(poll.createdAt)}</span>
        {poll.recurrence !== "NONE" && (
          <Badge variant="outline" className="gap-1">
            <Repeat className="h-3 w-3" /> {poll.currentEdition.label}
          </Badge>
        )}
        {poll.status === "CLOSED" && <Badge variant="outline">Closed</Badge>}
        <div className="ml-auto flex gap-2">
          {(poll.audienceType === "LINK" || poll.shareToken) && (
            <ShareButton pollId={poll.pollId} token={poll.shareToken ?? token} />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-5">
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight">
            {poll.question}
          </h1>
          <VotePanel poll={poll} token={token} />
        </CardContent>
      </Card>

      {isCreator && (
        <div className="mt-6">
          <AnalyticsStub />
        </div>
      )}

      <CommentsSection pollId={poll.pollId} token={token} />
    </div>
  );
}
