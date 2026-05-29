"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
import type { Comment } from "@/lib/types";
import { editComment, deleteComment } from "@/lib/comments";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ComingSoon } from "@/components/common/ComingSoon";
import { UserAvatar } from "@/components/common/UserAvatar";

/** A single comment. Author can edit/delete their own; vote arrows are a labeled stub. */
export function CommentItem({
  comment,
  currentUserId,
}: {
  comment: Comment;
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const isAuthor = currentUserId === comment.authorId;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["comments", comment.pollId] });
  }

  const edit = useMutation({
    mutationFn: () => editComment(comment.commentId, comment.pollId, draft.trim()),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
    onError: () => toast.error("Edit failed."),
  });

  const remove = useMutation({
    mutationFn: () => deleteComment(comment.commentId, comment.pollId),
    onSuccess: () => {
      toast.success("Comment deleted");
      invalidate();
    },
    onError: () => toast.error("Delete failed."),
  });

  if (comment.status === "REMOVED") {
    return <div className="py-3 text-sm italic text-muted-foreground">[comment removed]</div>;
  }

  return (
    <div className="flex gap-3 py-4">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <ComingSoon label="Comment voting — coming soon">
          <div className="flex flex-col items-center text-muted-foreground">
            <ChevronUp className="h-4 w-4" />
            <ChevronDown className="h-4 w-4" />
          </div>
        </ComingSoon>
      </div>

      <UserAvatar name={comment.authorId} className="h-8 w-8" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{comment.authorId.slice(0, 12)}</span>
          <span>·</span>
          <span>{relativeTime(comment.createdAt)}</span>
          {comment.updatedAt && <span>(edited)</span>}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => edit.mutate()} disabled={edit.isPending || !draft.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(comment.text); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{comment.text}</p>
        )}

        {isAuthor && !editing && (
          <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground">
            <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              className="inline-flex items-center gap-1 hover:text-destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
