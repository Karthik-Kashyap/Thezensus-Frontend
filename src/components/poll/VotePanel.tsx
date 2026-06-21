"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { VotablePoll } from "@/lib/types";
import { castVote, changeVote, getMyVote } from "@/lib/votes";
import { useSession } from "@/lib/session";
import { routes } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { PollResults } from "./PollResults";
import { PollImage } from "./PollImage";
import { VoteCount } from "./VoteCount";
import { cn } from "@/lib/utils";

/**
 * The core voting interaction. Shows clickable options before voting; after voting (or once the
 * edition closes) shows result bars with the user's choice highlighted and a "change vote"
 * affordance for signed-in users.
 *
 * Casting/changing fires a SINGLE request (the mutation) — its response is the read-your-write, so
 * we never re-read the user's own vote. The bars then update with NO extra fetch, two ways:
 *  • liveResults=false (feed cards) — no live subscription exists, so we reflect the vote with
 *    local optimistic state on top of the feed snapshot.
 *  • liveResults=true  (detail page) — the scoreboard is a LIVE Convex subscription (one push per
 *    tally publish). We overlay the user's own vote locally until the first publish issued after
 *    the cast (tracked via `publishedAt` — every later publish necessarily includes the vote, since
 *    it committed before the tally read), then drop the overlay so nothing double-counts.
 */
export function VotePanel({
  poll,
  token,
  liveResults = false,
  onVoted,
}: {
  poll: VotablePoll;
  token?: string;
  liveResults?: boolean;
  /** Called after a successful cast/change. Feed cards use it to pin the card (DESIGN-010)
   *  so the voter keeps watching live results; unused on the detail page. */
  onVoted?: () => void;
}) {
  const { user } = useSession();
  const [changing, setChanging] = useState(false);
  // The option the user picked in THIS session. Set from the cast/change response (read-your-write
  // without a re-read) and takes precedence over the server's mount-time value below.
  const [justVotedId, setJustVotedId] = useState<string | null>(null);
  // The teaser pick of a signed-out viewer — shows results locally, never persisted.
  const [anonVotedId, setAnonVotedId] = useState<string | null>(null);
  // Live-overlay bookkeeping: the publish stamp at vote time + the choice the vote replaced.
  // The overlay stays on while the live scoreboard still carries that stamp (i.e. the published
  // counts predate the vote) and expires on the first publish after it.
  const [overlay, setOverlay] = useState<{ baseline: number | null; prev: string | null } | null>(null);

  // Option/question images are owned by the poll creator (linkId); the local presign fallback
  // only fires when the viewer IS the creator (same rule as avatars). With a public CDN base set,
  // everyone resolves them.
  const mediaOwnerId = poll.creatorId;
  const mediaIsSelf = user?.linkId === poll.creatorId;

  const edition = poll.currentEdition;
  const open = poll.status === "ACTIVE" && edition.status === "OPEN" && edition.windowState !== "ENDED";
  const isAnonymous = poll.ballotMode === "anonymous";
  const isLink = poll.audienceType === "LINK";
  const guestAllowed = isLink && !poll.requireLoginToVote;
  const canInteract = open && (!!user || guestAllowed);
  // Anonymous viewer on a login-required poll: let them tap to SEE results, but the vote is
  // NOT recorded — a local-only teaser that nudges sign-in to make it count.
  const teaser = open && !user && !guestAllowed;

  // The user's server-side vote on this edition, read ONCE on mount (React Query refetches it when a
  // fresh observer mounts — e.g. opening the detail page). null for anonymous/guest polls or a
  // first-time voter. We never re-read it just to confirm a vote we just cast.
  const { data: myVote } = useQuery({
    queryKey: ["myVote", poll.pollId, token ?? null],
    queryFn: () => getMyVote(poll.pollId, token),
    enabled: (!!user || !!token) && !isAnonymous,
  });
  const serverMine = myVote?.vote?.optionId ?? null;
  const selectedId = justVotedId ?? serverMine ?? anonVotedId;
  const hasVoted = !!selectedId;

  const cast = useMutation({
    mutationFn: (optionId: string) => castVote({ pollId: poll.pollId, optionId, token }),
    onMutate: () => ({ prev: selectedId }), // selection before this click — for the overlay
    onSuccess: (r, _optionId, ctx) => {
      if (r.status === "alreadyVoted") toast.info("You’ve already voted on this one.");
      else if (liveResults) setOverlay({ baseline: edition.publishedAt ?? null, prev: ctx?.prev ?? null });
      setJustVotedId(r.optionId);
      onVoted?.();
    },
    onError: (e) => {
      const s = (e as { status?: number }).status;
      toast.error(s === 403 ? "You’re not allowed to vote on this poll." : "Vote failed — try again.");
    },
  });

  const change = useMutation({
    mutationFn: (optionId: string) => changeVote({ pollId: poll.pollId, optionId, token }),
    onMutate: () => ({ prev: selectedId }),
    onSuccess: (r, _optionId, ctx) => {
      setChanging(false);
      if (r.status === "changed" && liveResults) {
        setOverlay({ baseline: edition.publishedAt ?? null, prev: ctx?.prev ?? null });
      }
      setJustVotedId(r.optionId);
      onVoted?.();
    },
    onError: () => toast.error("Couldn’t change your vote."),
  });

  const pending = cast.isPending || change.isPending;
  const showResults = (hasVoted || !open) && !changing;

  // Reflect the user's in-session vote locally on top of the server counts: move one vote from
  // their prior choice to the new one; a first vote adds one to the total. Feed cards (static
  // snapshot) keep the overlay for the whole session; the live detail page drops it as soon as a
  // publish issued after the vote arrives (the stamp changes), so nothing double-counts.
  const overlayActive = liveResults
    ? overlay !== null && (edition.publishedAt ?? null) === overlay.baseline
    : justVotedId !== null && justVotedId !== serverMine;
  const overlayPrev = liveResults ? (overlay?.prev ?? null) : serverMine;
  let shownCounts = edition.optionCounts;
  let shownTotal = edition.voteCount;
  if (overlayActive && justVotedId && justVotedId !== overlayPrev) {
    shownCounts = { ...edition.optionCounts, [justVotedId]: (edition.optionCounts[justVotedId] ?? 0) + 1 };
    if (overlayPrev) {
      shownCounts[overlayPrev] = Math.max(0, (shownCounts[overlayPrev] ?? 0) - 1);
    } else {
      shownTotal = edition.voteCount + 1;
    }
  }

  return (
    <div className="space-y-4">
      {showResults ? (
        <>
          <PollResults
            options={poll.options}
            optionCounts={shownCounts}
            totalVotes={shownTotal}
            selectedId={selectedId}
            mediaOwnerId={mediaOwnerId}
            mediaIsSelf={mediaIsSelf}
          />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <VoteCount count={shownTotal} format={(n) => n.toLocaleString()} />
            {hasVoted && open && user && !isAnonymous && (
              <button className="font-medium text-primary hover:underline" onClick={() => setChanging(true)}>
                Change my vote
              </button>
            )}
            {hasVoted && isAnonymous && <span>Anonymous vote recorded</span>}
            {!open && <span>Voting closed</span>}
          </div>
          {anonVotedId && open && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/40 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                Your vote isn’t counted yet — sign in to make it count.
              </p>
              <LoginDialog
                returnTo={routes.poll(poll.pollId, token)}
                trigger={<Button size="sm">Sign in to make it count</Button>}
              />
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2.5">
          {poll.options.map((o, i) => {
            const action = changing ? change : cast;
            return (
              <button
                key={o.id}
                disabled={pending || (!canInteract && !teaser)}
                onClick={() => (teaser ? setAnonVotedId(o.id) : action.mutate(o.id))}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left font-medium transition active:scale-[0.99] hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                  {String.fromCharCode(65 + i)}
                </span>
                <PollImage
                  mediaId={o.mediaId}
                  mediaKey={o.mediaKey}
                  ownerId={mediaOwnerId}
                  isSelf={mediaIsSelf}
                  alt={o.label}
                  className="h-10 w-10 shrink-0 rounded-md"
                />
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
          {teaser && (
            <p className="pt-1 text-xs text-muted-foreground">
              Tap an option to see results — sign in to make your vote count.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
