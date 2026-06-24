"use client";

import { useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Poll, EditionScoreboard } from "@/lib/types";
import { useSession } from "@/lib/session";
import { formatEditionLabel } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { VotePanel } from "./VotePanel";
import { PollResults } from "./PollResults";
import { EditionSlider } from "./EditionSlider";
import { VoteCount } from "./VoteCount";

/**
 * The poll's voting surface plus (for recurring polls) an edition-history picker. The current
 * edition is the live, votable VotePanel exactly as before — the default. Selecting a PAST
 * edition swaps it for that edition's frozen results, read-only: you can only ever vote on the
 * live edition (the backend always casts onto the current label), so older editions are history.
 */
export function PollBallot({
  poll,
  token,
  initialEdition,
}: {
  poll: Poll;
  token?: string;
  /** Deep-link target (from a shared `?edition=` link): open on this edition instead of the live one. */
  initialEdition?: string;
}) {
  const recurring = poll.recurrence !== "NONE";
  const currentLabel = poll.currentEdition.label;
  // null = viewing the live current edition (the default). A shared `?edition=` link opens on that
  // past edition; the live edition (or no param) stays null so voting works as usual.
  const [selected, setSelected] = useState<string | null>(
    initialEdition && initialEdition !== currentLabel ? initialEdition : null,
  );
  const viewingPast = selected !== null && selected !== currentLabel;

  return (
    <div className="space-y-4">
      {recurring && (
        <EditionSlider
          pollId={poll.pollId}
          token={token}
          recurrence={poll.recurrence}
          value={selected ?? currentLabel}
          onChange={(label) => setSelected(label === currentLabel ? null : label)}
        />
      )}
      {viewingPast ? (
        <PastEditionResults poll={poll} label={selected!} token={token} />
      ) : (
        <VotePanel poll={poll} token={token} liveResults />
      )}
    </div>
  );
}

/** Read-only results for one past edition (api.polls.edition). No voting affordance — the
 *  edition is closed by virtue of the clock having moved past it. */
function PastEditionResults({ poll, label, token }: { poll: Poll; label: string; token?: string }) {
  const { user } = useSession();
  const edition = useConvexQuery(api.polls.edition, { pollId: poll.pollId, label, token }) as
    | EditionScoreboard
    | null
    | undefined;

  if (edition === undefined) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (edition === null) {
    return <p className="text-sm text-muted-foreground">This edition is no longer available.</p>;
  }

  return (
    <div className="space-y-3">
      <PollResults
        options={poll.options}
        optionCounts={edition.optionCounts}
        totalVotes={edition.voteCount}
        selectedId={null}
        mediaOwnerId={poll.creatorId}
        mediaIsSelf={user?.linkId === poll.creatorId}
      />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <VoteCount count={edition.voteCount} format={(n) => n.toLocaleString()} />
        <span>{formatEditionLabel(poll.recurrence, label)} · voting closed</span>
      </div>
    </div>
  );
}
