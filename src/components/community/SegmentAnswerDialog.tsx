"use client";

import { useState } from "react";
import type { SegmentDef } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/**
 * Collects a member's (optional) answers to a community's questions, then joins. Every question can
 * be left as "Prefer not to say" — only answered questions are submitted. Answers are set once at
 * join (not editable afterward).
 */
export function SegmentAnswerDialog({
  open,
  onOpenChange,
  communityName,
  segments,
  busy,
  onJoin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityName: string;
  segments: SegmentDef[];
  busy: boolean;
  onJoin: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function submit() {
    const cleaned: Record<string, string> = {};
    for (const [id, v] of Object.entries(answers)) if (v) cleaned[id] = v;
    onJoin(cleaned);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setAnswers({});
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join {communityName}</DialogTitle>
          <DialogDescription>
            This community asks a few questions of its members. Answering is optional — you can skip
            any of them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {segments.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <Label htmlFor={`ans-${q.id}`}>{q.label}</Label>
              <Select
                id={`ans-${q.id}`}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              >
                <option value="">Prefer not to say</option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Joining…" : "Join community"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
