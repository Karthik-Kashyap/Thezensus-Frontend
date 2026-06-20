"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deletePoll } from "@/lib/polls";
import { routes } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Delete-poll control for the poll detail header. The parent renders it only when the viewer
 * may delete (creator, or community owner/mod); the backend re-checks via canEditPoll on the
 * mutation, so the gate here is purely an affordance. Soft-deletes the poll (vote history is
 * retained), then leaves the now-inaccessible detail page for the community (or home).
 */
export function DeletePollButton({ pollId, communityId }: { pollId: string; communityId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deletePoll(pollId),
    onSuccess: () => {
      toast.success("Poll deleted");
      router.push(communityId ? routes.community(communityId) : "/");
    },
    onError: () => toast.error("Couldn’t delete this poll. Please try again."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this poll?</DialogTitle>
          <DialogDescription>
            The poll is removed for everyone. Anonymous aggregate vote counts are preserved. This
            can’t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Deleting…" : "Delete poll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
