"use client";

import { useSession } from "@/lib/session";
import { Hero } from "@/components/home/Hero";
import { HomeFeed } from "@/components/home/HomeFeed";
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

  return user ? <HomeFeed /> : <Hero />;
}
