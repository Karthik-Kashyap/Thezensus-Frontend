"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { createReport } from "@/lib/moderation";
import { REPORT_CATEGORY_OPTIONS } from "@/lib/constants";
import type { UserReportCategory, ReportTarget } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const TARGET_NOUN: Record<ReportTarget, string> = {
  POLL: "poll",
  COMMENT: "comment",
  USER: "user",
  COMMUNITY: "community",
};

/**
 * Report a poll/comment/user/community to the platform moderators. Caller decides eligibility
 * (logged-in, non-owner) — this just renders the trigger + dialog. `variant="inline"` is a compact
 * text button for action rows; the default is an outline button.
 */
export function ReportButton({
  targetType,
  targetId,
  communityId,
  label = "Report",
  variant = "default",
}: {
  targetType: ReportTarget;
  targetId: string;
  communityId?: string;
  label?: string;
  variant?: "default" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<UserReportCategory | "">("");
  const [reason, setReason] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      createReport({
        category: category as UserReportCategory,
        targetType,
        targetId,
        reason: reason.trim() || undefined,
        communityId,
      }),
    onSuccess: () => {
      toast.success("Report submitted. Thank you — our team will review it.");
      setOpen(false);
      setCategory("");
      setReason("");
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      toast.error(
        status === 409
          ? "You’ve already reported this."
          : "Couldn’t submit the report. Please try again.",
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "inline" ? (
          <button type="button" className="inline-flex items-center gap-1 hover:text-destructive">
            <Flag className="h-3 w-3" /> {label}
          </button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Flag className="h-4 w-4" /> {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this {TARGET_NOUN[targetType]}</DialogTitle>
          <DialogDescription>
            Tell us what’s wrong. Reports are sent to our moderators and reviewed confidentially.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-category">Reason</Label>
            <Select
              id="report-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as UserReportCategory)}
            >
              <option value="">Select a reason…</option>
              {REPORT_CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-detail">Details (optional)</Label>
            <Textarea
              id="report-detail"
              rows={3}
              maxLength={1000}
              placeholder="Add any context that will help us review this…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={!category || submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
