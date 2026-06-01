"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeOff, Undo2 } from "lucide-react";
import { takedownPoll, restorePoll } from "@/lib/admin";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** Take down (hide from every read path) or restore a poll. Takedown captures an optional reason. */
export function PollModerationButtons({
  pollId,
  relatedReportId,
}: {
  pollId: string;
  relatedReportId?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const takedown = useMutation({
    mutationFn: () => takedownPoll(pollId, { reason: reason.trim() || undefined, reportId: relatedReportId }),
    onSuccess: () => {
      invalidate();
      toast.success("Poll taken down");
      setOpen(false);
      setReason("");
    },
    onError: () => toast.error("Couldn’t take down the poll."),
  });

  const restore = useMutation({
    mutationFn: () => restorePoll(pollId),
    onSuccess: () => {
      invalidate();
      toast.success("Poll restored");
    },
    onError: () => toast.error("Couldn’t restore the poll."),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setReason("");
        }}
      >
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-1.5">
            <EyeOff className="h-4 w-4" /> Take down poll
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take down this poll</DialogTitle>
            <DialogDescription>
              The poll is hidden from every feed and its detail page. The row persists (held as
              evidence when illegal); you can restore it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="poll-takedown-reason">Reason (optional)</Label>
            <Textarea
              id="poll-takedown-reason"
              rows={3}
              maxLength={1000}
              placeholder="Why this poll is being removed…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={takedown.isPending} onClick={() => takedown.mutate()}>
              {takedown.isPending ? "Taking down…" : "Take down"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button variant="outline" size="sm" className="gap-1.5" disabled={restore.isPending} onClick={() => restore.mutate()}>
        <Undo2 className="h-4 w-4" /> {restore.isPending ? "Restoring…" : "Restore"}
      </Button>
    </div>
  );
}
