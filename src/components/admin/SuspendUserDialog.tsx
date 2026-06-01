"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { suspendUser } from "@/lib/admin";
import { SUSPEND_MODE_OPTIONS } from "@/lib/constants";
import type { SuspendInput } from "@/lib/types";
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
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** Suspend (temporary, with an `until` date) or permanently ban a user account. */
export function SuspendUserDialog({
  linkId,
  relatedReportId,
}: {
  linkId: string;
  relatedReportId?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"SUSPENDED" | "BANNED">("SUSPENDED");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");

  function reset() {
    setMode("SUSPENDED");
    setReason("");
    setUntil("");
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input: SuspendInput = {
        mode,
        reason: reason.trim(),
        relatedReportId,
        until: mode === "SUSPENDED" && until ? new Date(until).toISOString() : undefined,
      };
      return suspendUser(linkId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(mode === "BANNED" ? "User banned" : "User suspended");
      setOpen(false);
      reset();
    },
    onError: () => toast.error("Couldn’t apply the enforcement."),
  });

  const needsUntil = mode === "SUSPENDED";
  const canSubmit = reason.trim().length > 0 && (!needsUntil || !!until) && !mutation.isPending;
  const selected = SUSPEND_MODE_OPTIONS.find((o) => o.value === mode);

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
          <Ban className="h-4 w-4" /> Suspend / ban
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enforce on this user</DialogTitle>
          <DialogDescription>
            The user is blocked from acting platform-wide. This is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="suspend-mode">Action</Label>
            <Select
              id="suspend-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "SUSPENDED" | "BANNED")}
            >
              {SUSPEND_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            {selected && <p className="text-xs text-muted-foreground">{selected.hint}</p>}
          </div>
          {needsUntil && (
            <div className="space-y-1.5">
              <Label htmlFor="suspend-until">Suspended until</Label>
              <Input
                id="suspend-until"
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              rows={3}
              maxLength={1000}
              placeholder="Why this account is being actioned (kept in the audit log)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Applying…" : mode === "BANNED" ? "Ban user" : "Suspend user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
