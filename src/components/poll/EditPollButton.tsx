"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { updatePoll } from "@/lib/polls";
import { VISIBILITY_OPTIONS } from "@/lib/constants";
import type { Poll, Visibility } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mirror the backend POLL_LIMITS (tagsMax / tagMax); the update mutation re-validates.
const MAX_TAGS = 10;
const MAX_TAG_LEN = 40;

const sameTags = (a: string[], b: string[]) => a.join("") === b.join("");

/**
 * Poll settings / edit dialog — closes #35 (edit) and #36 (close) on one surface. The parent
 * renders it only when the viewer may manage the poll (creator, or community owner/mod); the
 * backend re-checks via canEditPoll on the `update` mutation, so the gate here is just an
 * affordance. The question and the options/recurrence are intentionally NOT editable: changing
 * the question would invalidate votes already cast, and options/recurrence are immutable backend
 * side. Closing is a reversible status flip (ACTIVE ⇄ CLOSED), so it lives here as a toggle
 * rather than a separate destructive action.
 */
export function EditPollButton({ poll }: { poll: Poll }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const isCommunity = poll.audienceType === "COMMUNITY";
  const isLink = poll.audienceType === "LINK";

  // Snapshot of the poll's current settings — the diff baseline. Recomputed each render from
  // the (live) poll prop; reseed() copies it into form state whenever the dialog opens, so a
  // background update can't leave the form editing stale values.
  const initial = {
    status: poll.status === "CLOSED" ? ("CLOSED" as const) : ("ACTIVE" as const),
    visibility: (poll.visibility ?? "public") as Visibility,
    requireLogin: poll.requireLoginToVote,
    showResults: poll.shareCardShowResults !== false, // absent = reveal
    tags: poll.tags ?? [],
  };

  const [status, setStatus] = useState(initial.status);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [requireLogin, setRequireLogin] = useState(initial.requireLogin);
  const [showResults, setShowResults] = useState(initial.showResults);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagDraft, setTagDraft] = useState("");

  function reseed() {
    setStatus(initial.status);
    setVisibility(initial.visibility);
    setRequireLogin(initial.requireLogin);
    setShowResults(initial.showResults);
    setTags(initial.tags);
    setTagDraft("");
  }

  function addTag(raw: string) {
    const t = raw.trim().replace(/^#+/, "").toLowerCase().slice(0, MAX_TAG_LEN);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= MAX_TAGS ? prev : [...prev, t]));
    setTagDraft("");
  }

  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  // Send only what actually changed — the backend rejects an empty patch ("Nothing to update").
  function buildPatch() {
    const patch: Parameters<typeof updatePoll>[1] = {};
    if (status !== initial.status) patch.status = status;
    if (isCommunity && visibility !== initial.visibility) patch.visibility = visibility;
    if (isLink && requireLogin !== initial.requireLogin) patch.requireLoginToVote = requireLogin;
    if (showResults !== initial.showResults) patch.shareCardShowResults = showResults;
    if (!sameTags(tags, initial.tags)) patch.tags = tags;
    return patch;
  }

  const dirty = Object.keys(buildPatch()).length > 0;

  const mutation = useMutation({
    mutationFn: () => updatePoll(poll.pollId, buildPatch()),
    onSuccess: () => {
      // The detail page is a live Convex subscription and refreshes itself; nudge the
      // react-query feed caches so list cards (the "Closed" badge, tags, visibility) catch up.
      queryClient.invalidateQueries({ queryKey: ["communityPolls", poll.communityId] });
      queryClient.invalidateQueries({ queryKey: ["creatorPolls", poll.creatorId] });
      queryClient.invalidateQueries({ queryKey: ["homeFeed"] });
      queryClient.invalidateQueries({ queryKey: ["discoverPolls"] });
      toast.success("Poll updated");
      setOpen(false);
    },
    onError: (e) => {
      const s = (e as { status?: number }).status;
      toast.error(s === 403 ? "You’re not allowed to edit this poll." : "Couldn’t save changes. Please try again.");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reseed();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Poll settings</DialogTitle>
          <DialogDescription className="line-clamp-2">{poll.question}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* #36 — close / reopen. Reversible, so a toggle rather than a destructive button. */}
          <div className="space-y-1.5">
            <Label htmlFor="poll-status">Status</Label>
            <Select
              id="poll-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "ACTIVE" | "CLOSED")}
            >
              <option value="ACTIVE">Open — accepting votes</option>
              <option value="CLOSED">Closed — voting stopped</option>
            </Select>
            {status === "CLOSED" && (
              <p className="text-xs text-muted-foreground">
                No one can vote while closed. You can reopen it anytime.
              </p>
            )}
          </div>

          {/* Visibility applies to community polls only (the backend rejects it for link polls). */}
          {isCommunity && (
            <div className="space-y-1.5">
              <Label htmlFor="poll-visibility">Visibility</Label>
              <Select
                id="poll-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
              >
                {VISIBILITY_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label} — {v.hint}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Guest voting is a link-poll concern (community polls gate on membership anyway). */}
          {isLink && (
            <div className="space-y-1.5">
              <Label htmlFor="poll-login">Who can vote</Label>
              <Select
                id="poll-login"
                value={requireLogin ? "yes" : "no"}
                onChange={(e) => setRequireLogin(e.target.value === "yes")}
              >
                <option value="yes">Require login to vote</option>
                <option value="no">Anyone with the link can vote</option>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="poll-share">Share card</Label>
            <Select
              id="poll-share"
              value={showResults ? "show" : "hide"}
              onChange={(e) => setShowResults(e.target.value === "show")}
            >
              <option value="show">Reveal the live results</option>
              <option value="hide">Hide results — vote to see</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="poll-tags">
              Topics <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 focus-within:border-primary/60">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-sm font-medium"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${t}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {tags.length < MAX_TAGS && (
                <input
                  id="poll-tags"
                  value={tagDraft}
                  maxLength={MAX_TAG_LEN}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={onTagKeyDown}
                  onBlur={() => addTag(tagDraft)}
                  placeholder={tags.length ? "Add another…" : "e.g. sports, nba, seattle"}
                  className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
