"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeOff } from "lucide-react";
import { takedownComment } from "@/lib/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Take down a comment. The Comments table is keyed by pollId, which a comment report doesn't carry —
 * so the admin supplies the parent poll's id here.
 */
export function CommentTakedownDialog({
  commentId,
  relatedReportId,
}: {
  commentId: string;
  relatedReportId?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pollId, setPollId] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setPollId("");
    setReason("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      takedownComment(commentId, {
        pollId: pollId.trim(),
        reason: reason.trim() || undefined,
        reportId: relatedReportId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Comment taken down");
      setOpen(false);
      reset();
    },
    onError: () => toast.error("Couldn’t take down the comment. Check the poll id."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5">
          <EyeOff className="h-4 w-4" /> Take down comment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take down this comment</DialogTitle>
          <DialogDescription>
            The comment is hidden from everyone. Enter the parent poll’s id (the comment’s table key).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="comment-pollid">Parent poll id</Label>
            <Input
              id="comment-pollid"
              value={pollId}
              onChange={(e) => setPollId(e.target.value)}
              placeholder="poll_…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comment-takedown-reason">Reason (optional)</Label>
            <Textarea
              id="comment-takedown-reason"
              rows={3}
              maxLength={1000}
              placeholder="Why this comment is being removed…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!pollId.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Taking down…" : "Take down"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
