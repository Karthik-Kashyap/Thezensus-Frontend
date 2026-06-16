"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { listDiscoverPolls } from "@/lib/polls";
import { routes } from "@/lib/constants";
import type { PollListItem } from "@/lib/types";
import { PollCard } from "@/components/poll/PollCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The global, hot-ranked feed (api.polls.discover) — the liveliest, most-voted public polls.
 * Used both as the "Discover" lane on the signed-in home and as the standalone cold-start feed
 * for logged-out visitors. `excludeIds` drops polls already shown elsewhere (the signed-in
 * "Your feed"); `showJoinCta` surfaces the onboarding Join button on each card.
 *
 * Trending topic chips (derived hot-weighted, server-side) let visitors narrow the feed to a
 * tag — "what's hot in #nba". The chip row only appears once polls carry tags, so an untagged
 * platform renders exactly as before. `keepPreviousData` keeps the chips + old cards on screen
 * while a topic switch refetches, so the row doesn't flicker.
 */
export function DiscoverFeed({
  title = "Discover",
  subtitle = "Public polls from across Thezensus.",
  excludeIds,
  showJoinCta = false,
}: {
  title?: string;
  subtitle?: string;
  excludeIds?: Set<string>;
  showJoinCta?: boolean;
}) {
  const [tag, setTag] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["discoverPolls", title, tag],
    queryFn: () => listDiscoverPolls({ limit: 25, tag: tag ?? undefined }),
    placeholderData: keepPreviousData,
  });

  const tags = data?.tags ?? [];
  const polls: PollListItem[] = (data?.items ?? []).filter((p) => !excludeIds?.has(p.pollId));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <TopicChip active={tag === null} onClick={() => setTag(null)} label="All" />
          {tags.map((t) => (
            <TopicChip key={t} active={tag === t} onClick={() => setTag(t)} label={`#${t}`} />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : polls.length === 0 ? (
        <EmptyState tag={tag} onClear={() => setTag(null)} />
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => (
            <PollCard key={poll.pollId} poll={poll} showJoinCta={showJoinCta} />
          ))}
        </div>
      )}
    </section>
  );
}

/** A pill toggle for one trending topic (and the "All" reset). */
function TopicChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/40",
      )}
    >
      {label}
    </button>
  );
}

/** Filtered-empty (a topic with nothing hot) is a lighter prompt-to-clear than the
 *  platform-empty cold start, which nudges the visitor to create the first poll. */
function EmptyState({ tag, onClear }: { tag: string | null; onClear: () => void }) {
  if (tag) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
        <Compass className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No <span className="font-medium">#{tag}</span> polls right now.
        </p>
        <Button variant="outline" size="sm" onClick={onClear}>
          Show all
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <Compass className="h-8 w-8 text-muted-foreground" />
      <p className="font-display text-lg font-semibold">Nothing here yet</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        There are no public polls to show. Be the first to ask a question.
      </p>
      <Button asChild className="mt-1">
        <Link href={routes.newPoll()}>Create a poll</Link>
      </Button>
    </div>
  );
}
