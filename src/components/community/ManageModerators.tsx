"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Shield, UserPlus, X } from "lucide-react";
import { addModerator, listCommunityRoles, removeModerator } from "@/lib/communities";
import { relativeTime } from "@/lib/format";
import type { RoleView } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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

/**
 * Moderators tab. Lists the owner + moderators. Only the OWNER can grant or remove moderators
 * (the service re-checks). Bans/pins are open to moderators too — managed in their own tabs.
 */
export function ManageModerators({
  communityId,
  isOwner,
}: {
  communityId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["communityRoles", communityId];

  const { data: roles, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => listCommunityRoles(communityId),
  });

  const remove = useMutation({
    mutationFn: (linkId: string) => removeModerator(communityId, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Moderator removed");
    },
    onError: () => toast.error("Couldn’t remove that moderator."),
  });

  // Owner first, then moderators by most-recently granted.
  const sorted = [...(roles ?? [])].sort((a, b) => {
    if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
    return a.at < b.at ? 1 : -1;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-md text-sm text-muted-foreground">
          Owners and moderators can manage bans and pinned polls. Only the owner can add or remove
          moderators.
        </p>
        {isOwner && <AddModeratorDialog communityId={communityId} />}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load roles. Refresh to try again.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => (
            <RoleRow
              key={r.linkId}
              role={r}
              canRemove={isOwner && r.role === "MODERATOR"}
              removing={remove.isPending && remove.variables === r.linkId}
              onRemove={() => remove.mutate(r.linkId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleRow({
  role,
  canRemove,
  removing,
  onRemove,
}: {
  role: RoleView;
  canRemove: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const isOwner = role.role === "OWNER";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <MemberLink linkId={role.linkId} />
          <Badge variant={isOwner ? "primary" : "outline"} className="gap-1">
            {isOwner ? <Crown className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
            {isOwner ? "Owner" : "Moderator"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Since {relativeTime(role.at)}</p>
      </div>
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5 text-muted-foreground hover:text-destructive"
          disabled={removing}
          onClick={onRemove}
        >
          <X className="h-4 w-4" /> {removing ? "Removing…" : "Remove"}
        </Button>
      )}
    </div>
  );
}

function AddModeratorDialog({ communityId }: { communityId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [linkId, setLinkId] = useState("");

  const mutation = useMutation({
    mutationFn: () => addModerator(communityId, linkId.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityRoles", communityId] });
      toast.success("Moderator added");
      setLinkId("");
      setOpen(false);
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      toast.error(
        status === 404
          ? "No member with that ID."
          : status === 409
            ? "That member already has a role."
            : "Couldn’t add that moderator.",
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setLinkId("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Add moderator
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a moderator</DialogTitle>
          <DialogDescription>
            Paste the member’s ID (the value in their profile URL,&nbsp;
            <code className="text-xs">/profile/&lt;id&gt;</code>). They’ll be able to ban members and
            pin polls in this community.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="add-mod-linkid">Member ID</Label>
          <Input
            id="add-mod-linkid"
            placeholder="e.g. 01J…"
            value={linkId}
            onChange={(e) => setLinkId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!linkId.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Adding…" : "Add moderator"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
