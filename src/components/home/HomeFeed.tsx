"use client";

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Flame, Plus, Compass } from "lucide-react";
import { listMySubscriptions } from "@/lib/communities";
import { listCommunityPolls } from "@/lib/polls";
import { routes } from "@/lib/constants";
import type { PollListItem } from "@/lib/types";
import { PollCard } from "@/components/poll/PollCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Logged-in home: a blended feed of the newest polls across the communities you've joined.
 * (A ranked global "trending" feed is a separate BRD feature with no backend yet — see the banner.)
 */
export function HomeFeed() {
  const { data: subs, isLoading: subsLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listMySubscriptions,
  });

  const communityIds = subs?.map((s) => s.communityId) ?? [];

  const pollQueries = useQueries({
    queries: communityIds.map((id) => ({
      queryKey: ["communityPolls", id, "home"],
      queryFn: () => listCommunityPolls(id, { limit: 10 }),
    })),
  });

  const loading = subsLoading || pollQueries.some((q) => q.isLoading);

  const polls: PollListItem[] = pollQueries
    .flatMap((q) => q.data?.items ?? [])
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Your feed</h1>
        <Button asChild size="sm">
          <Link href={routes.newPoll()}>
            <Plus className="h-4 w-4" /> Create
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Flame className="h-4 w-4 shrink-0 text-secondary" />
        <span>A global <strong className="font-semibold text-foreground">Trending</strong> feed is coming soon. For now, this shows polls from your communities.</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : communityIds.length === 0 ? (
        <EmptyState
          title="Join a community to fill your feed"
          body="Communities are where polls live. Create your own, or start one for your org."
        />
      ) : polls.length === 0 ? (
        <EmptyState
          title="No polls yet"
          body="The communities you’ve joined haven’t posted anything. Be the first."
        />
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => (
            <PollCard key={poll.pollId} poll={poll} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <Compass className="h-8 w-8 text-muted-foreground" />
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
      <div className="flex gap-2 pt-1">
        <Button asChild>
          <Link href={routes.newCommunity}>Create a community</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.newPoll()}>Create a poll</Link>
        </Button>
      </div>
    </div>
  );
}
