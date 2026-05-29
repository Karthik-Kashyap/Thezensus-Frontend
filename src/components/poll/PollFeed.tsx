"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import type { Page, PollListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PollCard } from "./PollCard";

interface PollFeedProps {
  queryKey: unknown[];
  /** Fetches one page; receives the cursor for pages after the first. */
  fetchPage: (cursor?: string) => Promise<Page<PollListItem>>;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function PollFeed({ queryKey, fetchPage, emptyTitle, emptyMessage }: PollFeedProps) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey,
      queryFn: ({ pageParam }) => fetchPage(pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor,
    });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="py-10 text-center text-sm text-destructive">Couldn’t load polls. Is the backend running?</p>;
  }

  const polls = data?.pages.flatMap((p) => p.items) ?? [];

  if (polls.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <p className="font-display text-lg font-semibold">{emptyTitle ?? "No polls yet"}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {emptyMessage ?? "Be the first to ask something here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {polls.map((poll) => (
        <PollCard key={poll.pollId} poll={poll} />
      ))}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
