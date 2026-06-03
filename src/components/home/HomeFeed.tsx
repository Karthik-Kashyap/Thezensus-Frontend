"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus, Compass } from "lucide-react";
import { listMySubscriptions } from "@/lib/communities";
import { listCommunityPolls, listDiscoverPolls } from "@/lib/polls";
import { routes } from "@/lib/constants";
import type { PollListItem } from "@/lib/types";
import { PollCard } from "@/components/poll/PollCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Logged-in home — two stacked feeds:
 *  • "Your feed" — newest polls across communities you've joined (subscription pull). Hidden until
 *    you've joined a community that has polls.
 *  • "Discover"  — public polls from across the platform (poll-service GET /polls/discover, swappable
 *    ranking — recency for now). This is what fills the page before you've joined anything.
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

  const { data: discover, isLoading: discoverLoading } = useQuery({
    queryKey: ["discoverPolls", "home"],
    queryFn: () => listDiscoverPolls({ limit: 25 }),
  });

  const yourFeedLoading = subsLoading || pollQueries.some((q) => q.isLoading);

  const myPolls: PollListItem[] = pollQueries
    .flatMap((q) => q.data?.items ?? [])
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  // Discover = global public polls, minus anything already shown in "Your feed" (no duplicates).
  const seen = new Set(myPolls.map((p) => p.pollId));
  const discoverPolls = (discover?.items ?? []).filter((p) => !seen.has(p.pollId));

  const nothingToShow =
    !yourFeedLoading &&
    !discoverLoading &&
    myPolls.length === 0 &&
    discoverPolls.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Home</h1>
        <Button asChild size="sm">
          <Link href={routes.newPoll()}>
            <Plus className="h-4 w-4" /> Create
          </Link>
        </Button>
      </div>

      {/* Your feed — only once you've joined communities that have posted polls. */}
      {yourFeedLoading ? (
        <FeedSkeleton title="Your feed" />
      ) : myPolls.length > 0 ? (
        <FeedSection title="Your feed" subtitle="Newest polls from communities you’ve joined.">
          {myPolls.map((poll) => (
            <PollCard key={poll.pollId} poll={poll} />
          ))}
        </FeedSection>
      ) : null}

      {/* Discover — public polls from across the platform. */}
      {discoverLoading ? (
        <FeedSkeleton title="Discover" />
      ) : discoverPolls.length > 0 ? (
        <FeedSection title="Discover" subtitle="Public polls from across Thezensus.">
          {discoverPolls.map((poll) => (
            <PollCard key={poll.pollId} poll={poll} />
          ))}
        </FeedSection>
      ) : null}

      {nothingToShow ? (
        <EmptyState
          title="Nothing here yet"
          body="There are no public polls to show. Create the first one, or start a community."
        />
      ) : null}
    </div>
  );
}

function FeedSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FeedSkeleton({ title }: { title: string }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </section>
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
