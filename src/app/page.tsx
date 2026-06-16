"use client";

import { useSession } from "@/lib/session";
import { Hero } from "@/components/home/Hero";
import { HomeFeed } from "@/components/home/HomeFeed";
import { DiscoverFeed } from "@/components/home/DiscoverFeed";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // Logged out: pitch (Hero) + instant value — a live feed they can browse and teaser-vote on,
  // with a Join nudge that routes through sign-in (and back) per A/the strategy's "no-signup" loop.
  return user ? (
    <HomeFeed />
  ) : (
    <div className="space-y-10">
      <Hero compact />
      <div className="mx-auto max-w-2xl">
        <DiscoverFeed
          title="What people are voting on"
          subtitle="Vote on anything — sign in to make it count."
          showJoinCta
        />
      </div>
    </div>
  );
}
