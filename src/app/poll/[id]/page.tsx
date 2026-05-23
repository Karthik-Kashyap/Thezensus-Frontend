// Poll detail — SSR, fresh per request (DESIGN-001 §9).
export const dynamic = "force-dynamic";

export default async function PollDetailPage({ params }: { params: { id: string } }) {
  // TODO(DESIGN §9): fetch GET /polls/:id, /polls/:id/comments?sort=top,
  //                  and /polls/:id/vote (if authed).
  return (
    <main>
      <h1>Poll {params.id}</h1>
      {/* TODO(DESIGN §9): <VoteWidget /> <LiveVoteCount /> <CommentThread /> */}
    </main>
  );
}
