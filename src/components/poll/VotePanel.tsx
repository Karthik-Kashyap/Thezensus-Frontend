"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import type { Poll } from "@/lib/types";
import { castVote, changeVote, getMyVote } from "@/lib/votes";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { PollResults } from "./PollResults";
import { cn } from "@/lib/utils";

/**
 * The core voting interaction. Shows clickable options before voting; after voting (or once
 * the edition closes) shows live result bars with the user's choice highlighted and a
 * "change vote" affordance for signed-in users.
 */
export function VotePanel({ poll, token }: { poll: Poll; token?: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);

  const edition = poll.currentEdition;
  const open = poll.status === "ACTIVE" && edition.status === "OPEN" && edition.windowState !== "ENDED";
  const isLink = poll.audienceType === "LINK";
  const guestAllowed = isLink && !poll.requireLoginToVote;
  const canInteract = open && (!!user || guestAllowed);
  const mustSignIn = open && !user && !guestAllowed;

  // The user's existing vote on this edition (read-your-write).
  const { data: myVote } = useQuery({
    queryKey: ["myVote", poll.pollId, token ?? null],
    queryFn: () => getMyVote(poll.pollId, token),
    enabled: !!user || !!token,
  });
  const selectedId = myVote?.vote?.optionId ?? null;
  const hasVoted = !!selectedId;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["poll", poll.pollId] });
    queryClient.invalidateQueries({ queryKey: ["myVote", poll.pollId, token ?? null] });
  }

  const cast = useMutation({
    mutationFn: (optionId: string) => castVote({ pollId: poll.pollId, optionId, token }),
    onSuccess: (r) => {
      if (r.status === "alreadyVoted") toast.info("You’ve already voted on this one.");
      refresh();
    },
    onError: (e) => {
      const s = (e as { status?: number }).status;
      toast.error(s === 403 ? "You’re not allowed to vote on this poll." : "Vote failed — try again.");
    },
  });

  const change = useMutation({
    mutationFn: (optionId: string) => changeVote({ pollId: poll.pollId, optionId, token }),
    onSuccess: () => {
      setChanging(false);
      refresh();
    },
    onError: () => toast.error("Couldn’t change your vote."),
  });

  const pending = cast.isPending || change.isPending;
  const showResults = (hasVoted || !open) && !changing;

  return (
    <div className="space-y-4">
      {showResults ? (
        <>
          <PollResults
            options={poll.options}
            optionCounts={edition.optionCounts}
            totalVotes={edition.voteCount}
            selectedId={selectedId}
          />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{edition.voteCount.toLocaleString()} votes</span>
            {hasVoted && open && user && (
              <button className="font-medium text-primary hover:underline" onClick={() => setChanging(true)}>
                Change my vote
              </button>
            )}
            {!open && <span>Voting closed</span>}
          </div>
        </>
      ) : mustSignIn ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Sign in to cast your vote.</p>
          <LoginDialog trigger={<Button>Sign in to vote</Button>} redirectTo={`/poll/${poll.pollId}`} />
        </div>
      ) : (
        <div className="space-y-2.5">
          {poll.options.map((o, i) => {
            const action = changing ? change : cast;
            return (
              <button
                key={o.id}
                disabled={pending || !canInteract}
                onClick={() => action.mutate(o.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left font-medium transition active:scale-[0.99] hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                  {String.fromCharCode(65 + i)}
                </span>
                {o.label}
                {pending && action.variables === o.id && (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
                )}
              </button>
            );
          })}
          {changing && (
            <button className="text-sm text-muted-foreground hover:underline" onClick={() => setChanging(false)}>
              Cancel
            </button>
          )}
          {guestAllowed && !user && (
            <p className="pt-1 text-xs text-muted-foreground">You’re voting as a guest.</p>
          )}
        </div>
      )}
    </div>
  );
}
