"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { getMySubscription, subscribe, unsubscribe } from "@/lib/communities";
import { useSession } from "@/lib/session";
import type { SegmentDef } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { SegmentAnswerDialog } from "./SegmentAnswerDialog";

export function SubscribeButton({
  communityId,
  communityName = "this community",
  segments,
}: {
  communityId: string;
  communityName?: string;
  segments?: SegmentDef[];
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const hasQuestions = (segments?.length ?? 0) > 0;

  const { data: subscribed, isLoading } = useQuery({
    queryKey: ["subscription", communityId],
    enabled: !!user,
    queryFn: async () => {
      try {
        await getMySubscription(communityId);
        return true;
      } catch (e) {
        if ((e as { status?: number }).status === 404) return false;
        throw e;
      }
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["subscription", communityId] });
    queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["community", communityId] });
  }

  const join = useMutation({
    mutationFn: (answers?: Record<string, string>) => subscribe(communityId, answers),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Joined community");
    },
    onError: () => toast.error("Couldn’t join. You may be banned from this community."),
  });

  const leave = useMutation({
    mutationFn: () => unsubscribe(communityId),
    onSuccess: () => {
      invalidate();
      toast.success("Left community");
    },
    onError: () => toast.error("Something went wrong."),
  });

  if (!user) {
    return (
      <LoginDialog
        trigger={
          <Button>
            <Plus className="h-4 w-4" /> Join
          </Button>
        }
      />
    );
  }

  if (subscribed) {
    return (
      <Button
        variant="outline"
        onClick={() => leave.mutate()}
        disabled={leave.isPending}
        className="group"
      >
        <Check className="h-4 w-4 group-hover:hidden" />
        <span className="group-hover:hidden">Joined</span>
        <span className="hidden group-hover:inline">Leave</span>
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={() => (hasQuestions ? setDialogOpen(true) : join.mutate(undefined))}
        disabled={join.isPending || isLoading}
      >
        <Plus className="h-4 w-4" /> Join
      </Button>
      {hasQuestions && (
        <SegmentAnswerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          communityName={communityName}
          segments={segments!}
          busy={join.isPending}
          onJoin={(answers) => join.mutate(answers)}
        />
      )}
    </>
  );
}
