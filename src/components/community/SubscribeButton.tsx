"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { getMySubscription, subscribe, unsubscribe } from "@/lib/communities";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/auth/LoginDialog";

export function SubscribeButton({ communityId }: { communityId: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();

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

  const mutation = useMutation({
    mutationFn: async () => {
      if (subscribed) await unsubscribe(communityId);
      else await subscribe(communityId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", communityId] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["community", communityId] });
      toast.success(subscribed ? "Left community" : "Joined community");
    },
    onError: () => toast.error("Something went wrong. You may need to answer member questions to join."),
  });

  if (!user) {
    return (
      <LoginDialog trigger={<Button><Plus className="h-4 w-4" /> Join</Button>} />
    );
  }

  if (subscribed) {
    return (
      <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="group">
        <Check className="h-4 w-4 group-hover:hidden" />
        <span className="group-hover:hidden">Joined</span>
        <span className="hidden group-hover:inline">Leave</span>
      </Button>
    );
  }

  return (
    <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || isLoading}>
      <Plus className="h-4 w-4" /> Join
    </Button>
  );
}
