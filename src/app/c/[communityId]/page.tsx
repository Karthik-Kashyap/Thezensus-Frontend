"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { getCommunity } from "@/lib/communities";
import { listCommunityPolls } from "@/lib/polls";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { PollFeed } from "@/components/poll/PollFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function CommunityPage() {
  const { communityId } = useParams<{ communityId: string }>();

  const { data: community, isLoading, error } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () => getCommunity(communityId),
  });

  if (isLoading) {
    return (
      <PageContainer className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </PageContainer>
    );
  }

  if (error || !community) {
    const status = (error as { status?: number } | null)?.status;
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold">
          {status === 403 ? "Private community" : "Community not found"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {status === 403
            ? "You need to be a member to view this community."
            : "This community doesn’t exist."}
        </p>
      </div>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <CommunityHeader community={community} />
      <PollFeed
        queryKey={["communityPolls", communityId]}
        fetchPage={(cursor) => listCommunityPolls(communityId, { cursor })}
        emptyTitle="No polls yet"
        emptyMessage="Start the conversation — create the first poll here."
      />
    </PageContainer>
  );
}
