"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { listPollComments, postComment } from "@/lib/comments";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { CommentItem } from "./CommentItem";

/** A poll's flat comment thread: composer (auth-gated) + newest-first paginated list. */
export function CommentsSection({ pollId, token }: { pollId: string; token?: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["comments", pollId],
    queryFn: ({ pageParam }) => listPollComments(pollId, { token, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });

  const post = useMutation({
    mutationFn: () => postComment(pollId, draft.trim(), token),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["comments", pollId] });
      toast.success("Comment posted");
    },
    onError: () => toast.error("Couldn’t post your comment."),
  });

  const comments = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold">
        <MessageSquare className="h-5 w-5" /> Discussion
      </h2>

      {user ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Add to the discussion…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={() => post.mutate()} disabled={post.isPending || !draft.trim()}>
              {post.isPending ? "Posting…" : "Comment"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <span>Sign in to join the discussion.</span>
          <LoginDialog trigger={<Button size="sm" variant="outline">Sign in</Button>} redirectTo={`/poll/${pollId}`} />
        </div>
      )}

      <div className="mt-4 divide-y">
        {isLoading ? (
          <div className="space-y-3 py-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
        ) : (
          comments.map((c) => <CommentItem key={c.commentId} comment={c} currentUserId={user?.userId} />)
        )}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading…" : "Load more comments"}
          </Button>
        </div>
      )}
    </section>
  );
}
