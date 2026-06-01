"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Unlock, ShieldX } from "lucide-react";
import { openHold, releaseHold, preserveMedia } from "@/lib/admin";
import { HOLD_REASON_OPTIONS, SUBJECT_TYPE_OPTIONS } from "@/lib/constants";
import type { HoldReason, SubjectType } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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

/**
 * Preservation tools: open/release a legal hold on a subject (an ACTIVE hold suspends deletion +
 * TTL — FOUNDATION-07) and preserve a media file as evidence. The subject is prefilled from the
 * report target where it maps to a hold subject type.
 */
export function HoldTools({
  defaultSubjectType,
  defaultSubjectId,
  relatedReportId,
}: {
  defaultSubjectType: SubjectType;
  defaultSubjectId: string;
  relatedReportId?: string;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const [subjectType, setSubjectType] = useState<SubjectType>(defaultSubjectType);
  const [subjectId, setSubjectId] = useState(defaultSubjectId);

  const release = useMutation({
    mutationFn: () => releaseHold({ subjectType, subjectId: subjectId.trim() }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Released ${r.released} hold${r.released === 1 ? "" : "s"}`);
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      toast.error(status === 404 ? "No active hold on this subject." : "Couldn’t release the hold.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preservation &amp; legal holds</CardTitle>
        <p className="text-sm text-muted-foreground">
          An active hold blocks deletion and TTL expiry for the subject. Use for law-enforcement,
          CSAM evidence, investigations, or litigation.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="hold-subject-type">Subject type</Label>
            <Select
              id="hold-subject-type"
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value as SubjectType)}
            >
              {SUBJECT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-subject-id">Subject id</Label>
            <Input
              id="hold-subject-id"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="linkId / userId / pollId / mediaId…"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <OpenHoldDialog
            subjectType={subjectType}
            subjectId={subjectId}
            relatedReportId={relatedReportId}
            onDone={invalidate}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!subjectId.trim() || release.isPending}
            onClick={() => release.mutate()}
          >
            <Unlock className="h-4 w-4" /> {release.isPending ? "Releasing…" : "Release hold"}
          </Button>
          <PreserveMediaDialog relatedReportId={relatedReportId} onDone={invalidate} />
        </div>
      </CardContent>
    </Card>
  );
}

function OpenHoldDialog({
  subjectType,
  subjectId,
  relatedReportId,
  onDone,
}: {
  subjectType: SubjectType;
  subjectId: string;
  relatedReportId?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<HoldReason | "">("");
  const [caseRef, setCaseRef] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  function reset() {
    setReason("");
    setCaseRef("");
    setExpiresAt("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      openHold({
        subjectType,
        subjectId: subjectId.trim(),
        reason: reason as HoldReason,
        caseRef: caseRef.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        relatedReportId,
      }),
    onSuccess: () => {
      onDone();
      toast.success("Legal hold opened");
      setOpen(false);
      reset();
    },
    onError: () => toast.error("Couldn’t open the hold."),
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
        <Button size="sm" className="gap-1.5" disabled={!subjectId.trim()}>
          <Lock className="h-4 w-4" /> Open hold
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open a legal hold</DialogTitle>
          <DialogDescription>
            Preserves <code>{subjectType}#{subjectId || "…"}</code> — deletion and TTL are suspended
            until the hold is released.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hold-reason">Reason</Label>
            <Select
              id="hold-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as HoldReason)}
            >
              <option value="">Select a reason…</option>
              {HOLD_REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-caseref">Case reference (optional)</Label>
            <Input
              id="hold-caseref"
              value={caseRef}
              onChange={(e) => setCaseRef(e.target.value)}
              placeholder="e.g. NCMEC-2026-0001"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-expires">Auto-release date (optional)</Label>
            <Input
              id="hold-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!reason || !subjectId.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Opening…" : "Open hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreserveMediaDialog({
  relatedReportId,
  onDone,
}: {
  relatedReportId?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mediaId, setMediaId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setMediaId("");
    setOwnerId("");
    setReason("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      preserveMedia(mediaId.trim(), {
        ownerId: ownerId.trim(),
        reason: reason.trim() || undefined,
        reportId: relatedReportId,
      }),
    onSuccess: () => {
      onDone();
      toast.success("Media preserved");
      setOpen(false);
      reset();
    },
    onError: () => toast.error("Couldn’t preserve the media. Check the ids."),
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
        <Button variant="outline" size="sm" className="gap-1.5">
          <ShieldX className="h-4 w-4" /> Preserve media
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preserve a media file</DialogTitle>
          <DialogDescription>
            Moves the file off serving and locks it as evidence (deletion + TTL skip it).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="preserve-media-id">Media id</Label>
            <Input
              id="preserve-media-id"
              value={mediaId}
              onChange={(e) => setMediaId(e.target.value)}
              placeholder="media_…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preserve-owner-id">Owner id</Label>
            <Input
              id="preserve-owner-id"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder="linkId / communityId / pollId"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preserve-reason">Reason (optional)</Label>
            <Textarea
              id="preserve-reason"
              rows={2}
              maxLength={1000}
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
            disabled={!mediaId.trim() || !ownerId.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Preserving…" : "Preserve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
