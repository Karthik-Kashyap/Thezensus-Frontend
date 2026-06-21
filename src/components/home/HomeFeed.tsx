"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { listMySubscriptions } from "@/lib/communities";
import { listHomeFeed } from "@/lib/polls";
import { useSession } from "@/lib/session";
import { routes } from "@/lib/constants";
import type { PollListItem } from "@/lib/types";
import { PollCard } from "@/components/poll/PollCard";
import { DiscoverFeed } from "./DiscoverFeed";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Logged-in home — two stacked feeds:
 *  • "Your feed" — hot-ranked polls across communities you've joined (api.polls.homeFeed). Hidden
 *    until you've joined a community that has polls.
 *  • "Discover"  — the global hot-ranked feed (DiscoverFeed), minus anything already in "Your feed".
 * New users (zero communities joined) get a "Join" nudge on the Discover cards.
 */
export function HomeFeed() {
  // Auth-gate the user-scoped queries: during sign-out this component briefly stays mounted
  // while the Convex token is already cleared, so without the gate they fire a 401.
  const { user } = useSession();

  const { data: home, isLoading: yourFeedLoading } = useQuery({
    queryKey: ["homeFeed"],
    queryFn: () => listHomeFeed({ limit: 30 }),
    enabled: !!user,
  });

  const { data: subs } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listMySubscriptions,
    enabled: !!user,
  });

  // "New user" = hasn't joined any community yet. The Join nudge self-resolves — it vanishes the
  // moment they join their first one. (Undefined while loading → no nudge flash for existing users.)
  const isOnboarding = subs !== undefined && subs.length === 0;

  const myPolls: PollListItem[] = home?.items ?? [];
  const seen = new Set(myPolls.map((p) => p.pollId));

  return (
    <PageContainer className="space-y-10">
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
        <FeedSection title="Your feed" subtitle="What’s active in communities you’ve joined.">
          {myPolls.map((poll) => (
            <PollCard key={poll.pollId} poll={poll} />
          ))}
        </FeedSection>
      ) : null}

      {/* Discover — global hot-ranked feed; new users get a Join nudge on each card. */}
      <DiscoverFeed excludeIds={seen} showJoinCta={isOnboarding} />
    </PageContainer>
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
