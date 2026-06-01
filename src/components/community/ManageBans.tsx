"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Inbox, RotateCcw } from "lucide-react";
import { banMember, listCommunityBans, unbanMember } from "@/lib/communities";
import { relativeTime } from "@/lib/format";
import type { BanView } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MemberLink } from "./MemberLink";

/** Bans tab. Owner + moderators can ban members (by id) and lift bans. */
export function ManageBans({ communityId }: { communityId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["communityBans", communityId];

  const { data: bans, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => listCommunityBans(communityId),
  });

  const unban = useMutation({
    mutationFn: (linkId: string) => unbanMember(communityId, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Ban lifted");
    },
    onError: () => toast.error("Couldn’t lift that ban."),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-md text-sm text-muted-foreground">
          Banned members can’t subscribe to or participate in this community. Banning a moderator
          removes their role first.
        </p>
        <BanMemberDialog communityId={communityId} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load bans. Refresh to try again.
          </CardContent>
        </Card>
      ) : (bans ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No bans</p>
            <p className="text-sm text-muted-foreground">No one is banned from this community.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {bans!.map((b) => (
            <BanRow
              key={b.linkId}
              ban={b}
              lifting={unban.isPending && unban.variables === b.linkId}
              onUnban={() => unban.mutate(b.linkId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BanRow({
  ban,
  lifting,
  onUnban,
}: {
  ban: BanView;
  lifting: boolean;
  onUnban: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="min-w-0 space-y-1">
        <MemberLink linkId={ban.linkId} />
        {ban.reason ? (
          <p className="text-sm text-foreground/80">{ban.reason}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No reason given</p>
        )}
        <p className="text-xs text-muted-foreground">Banned {relativeTime(ban.createdAt)}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={lifting}
        onClick={onUnban}
      >
        <RotateCcw className="h-4 w-4" /> {lifting ? "Lifting…" : "Unban"}
      </Button>
    </div>
  );
}

function BanMemberDialog({ communityId }: { communityId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [linkId, setLinkId] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setLinkId("");
    setReason("");
  }

  const mutation = useMutation({
    mutationFn: () => banMember(communityId, linkId.trim(), reason.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityBans", communityId] });
      toast.success("Member banned");
      reset();
      setOpen(false);
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      toast.error(status === 404 ? "No member with that ID." : "Couldn’t ban that member.");
    },
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
          <Ban className="h-4 w-4" /> Ban a member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ban a member</DialogTitle>
          <DialogDescription>
            Paste the member’s ID (the value in their profile URL,&nbsp;
            <code className="text-xs">/profile/&lt;id&gt;</code>).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ban-linkid">Member ID</Label>
            <Input
              id="ban-linkid"
              placeholder="e.g. 01J…"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ban-reason">Reason (optional)</Label>
            <Textarea
              id="ban-reason"
              rows={3}
              maxLength={500}
              placeholder="Why this member is being banned…"
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
            disabled={!linkId.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Banning…" : "Ban member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
