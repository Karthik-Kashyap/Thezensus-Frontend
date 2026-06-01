"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, Pin, PinOff } from "lucide-react";
import { pinPoll, unpinPoll } from "@/lib/communities";
import { listCommunityPolls } from "@/lib/polls";
import { relativeTime } from "@/lib/format";
import type { PollListItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_LIMIT = 50;

/**
 * Pinned-polls tab. Owner + moderators pin/unpin the community's polls. The pinned set is the
 * source of truth on the community itself (`pinnedPollIds`), passed in by the page; toggling
 * invalidates the community query so the header + page reflect the change.
 */
export function ManagePins({
  communityId,
  pinnedPollIds,
}: {
  communityId: string;
  pinnedPollIds: string[];
}) {
  const queryClient = useQueryClient();
  const pinned = new Set(pinnedPollIds);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["communityPolls", communityId, "manage"],
    queryFn: () => listCommunityPolls(communityId, { limit: PAGE_LIMIT }),
  });

  const toggle = useMutation({
    mutationFn: async ({ pollId, isPinned }: { pollId: string; isPinned: boolean }) => {
      if (isPinned) await unpinPoll(communityId, pollId);
      else await pinPoll(communityId, pollId);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["community", communityId] });
      toast.success(vars.isPinned ? "Poll unpinned" : "Poll pinned");
    },
    onError: () => toast.error("Couldn’t update the pin."),
  });

  const polls = data?.items ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pinned polls appear at the top of the community. Pin the polls you want members to see first.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load polls. Refresh to try again.
          </CardContent>
        </Card>
      ) : polls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No polls yet</p>
            <p className="text-sm text-muted-foreground">
              Once this community has polls, you can pin them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {polls.map((p) => (
              <PinRow
                key={p.pollId}
                poll={p}
                isPinned={pinned.has(p.pollId)}
                busy={toggle.isPending && toggle.variables?.pollId === p.pollId}
                onToggle={(isPinned) => toggle.mutate({ pollId: p.pollId, isPinned })}
              />
            ))}
          </div>
          {data?.nextCursor && (
            <p className="text-center text-xs text-muted-foreground">
              Showing the {PAGE_LIMIT} most recent polls.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PinRow({
  poll,
  isPinned,
  busy,
  onToggle,
}: {
  poll: PollListItem;
  isPinned: boolean;
  busy: boolean;
  onToggle: (isPinned: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{poll.question}</p>
          {isPinned && (
            <Badge variant="primary" className="gap-1">
              <Pin className="h-3 w-3" /> Pinned
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{relativeTime(poll.createdAt)}</p>
      </div>
      <Button
        variant={isPinned ? "ghost" : "outline"}
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={busy}
        onClick={() => onToggle(isPinned)}
      >
        {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        {busy ? "Saving…" : isPinned ? "Unpin" : "Pin"}
      </Button>
    </div>
  );
}
