"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { createCommunity, subscribe } from "@/lib/communities";
import { SEGMENT_LIMITS, routes } from "@/lib/constants";
import type { CreateCommunityInput, SegmentDef, Visibility } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper, type Step } from "@/components/ui/stepper";
import { SegmentEditor } from "./SegmentEditor";
import { VisibilityField } from "./VisibilityField";

// Mirror COMMUNITY_LIMITS in community-service — the create mutation re-validates.
const TAGS_MAX = 10;
const TAG_MAX = 40;
const CATEGORY_MAX = 40;
const RULES_MAX = 4000;

/** Trim a draft question and drop empty options. Used to decide which questions to keep + validate. */
function cleanQuestion(q: SegmentDef): SegmentDef {
  return {
    id: q.id,
    label: q.label.trim(),
    options: q.options.map((o) => o.trim()).filter(Boolean),
  };
}

export function CreateCommunityForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [rules, setRules] = useState("");
  const [segments, setSegments] = useState<SegmentDef[]>([]);

  const mutation = useMutation({
    // The backend treats OWNER (role) and member (subscription) as distinct, so we
    // auto-subscribe the creator — they're conceptually a member of their own community.
    mutationFn: async (input: CreateCommunityInput) => {
      const community = await createCommunity(input);
      try {
        await subscribe(community.communityId);
      } catch {
        // Non-fatal — the user can still join from the community page.
      }
      return community;
    },
    onSuccess: (community) => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["subscription", community.communityId] });
      toast.success("Community created");
      router.push(routes.community(community.communityId));
    },
    onError: (e) => {
      // Surface the backend's specific validation reason (e.g. "At most 5 member questions")
      // on a 400 — a generic message hides why a create was refused. Fall back otherwise.
      const err = e as { status?: number; message?: string };
      toast.error(err.status === 400 && err.message ? err.message : "Could not create the community.");
    },
  });

  // Topics — bare lowercase tokens (the "#nba" model), deduped, capped. Mirrors the poll forms.
  function addTag(raw: string) {
    const t = raw.trim().replace(/^#+/, "").toLowerCase().slice(0, TAG_MAX);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= TAGS_MAX ? prev : [...prev, t]));
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    // Keep only questions the owner actually touched; each kept one must be complete.
    const cleaned = segments
      .map(cleanQuestion)
      .filter((q) => q.label.length > 0 || q.options.length > 0);
    for (const q of cleaned) {
      if (!q.label || q.options.length < SEGMENT_LIMITS.optionsMin) {
        toast.error(`Each member question needs a label and at least ${SEGMENT_LIMITS.optionsMin} options.`);
        return;
      }
    }

    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      visibility,
      category: category.trim() || undefined,
      tags: tags.length ? tags : undefined,
      rules: rules.trim() || undefined,
      segments: cleaned.length ? cleaned : undefined,
    });
  }

  // Progress rail state. "Who can join?" always has a value (defaults to public), so it's
  // satisfied from the start; member questions are optional, so they show amber until filled.
  const steps: Step[] = [
    {
      id: "details",
      label: "Community details",
      description: "Name your community",
      status: name.trim() ? "complete" : "incomplete",
    },
    {
      id: "audience",
      label: "Who can join?",
      description: "Choose visibility",
      status: "complete",
    },
    {
      id: "questions",
      label: "Member questions",
      description: "Optional",
      status: segments.some((s) => s.label.trim().length > 0) ? "complete" : "optional",
    },
  ];

  return (
    <div className="flex gap-8 lg:gap-12">
      <aside className="sticky top-24 hidden h-fit w-44 shrink-0 self-start lg:block">
        <Stepper steps={steps} />
      </aside>

      <form onSubmit={onSubmit} className="min-w-0 flex-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Community details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Stanford CS, r/CoffeeLovers, Acme Inc."
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What is this community about?"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">
                Category <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="category"
                placeholder="e.g. Technology, Sports, Education"
                maxLength={CATEGORY_MAX}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tags">
                Topics <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Add up to {TAGS_MAX} so people can find this community. Press Enter or comma.
              </p>
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
                {tags.length < TAGS_MAX && (
                  <input
                    id="tags"
                    value={tagDraft}
                    maxLength={TAG_MAX}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={onTagKeyDown}
                    onBlur={() => addTag(tagDraft)}
                    placeholder={tags.length ? "Add another…" : "e.g. gaming, seattle, ai"}
                    className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who can join?</CardTitle>
          </CardHeader>
          <CardContent>
            <VisibilityField value={visibility} onChange={setVisibility} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Community rules</CardTitle>
            <p className="text-sm text-muted-foreground">
              Optional. Guidelines shown to members — what’s welcome here and what isn’t.
            </p>
          </CardHeader>
          <CardContent>
            <Textarea
              id="rules"
              placeholder="e.g. Be respectful. No spam or self-promotion. Stay on topic."
              maxLength={RULES_MAX}
              rows={5}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Member questions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Optional. Ask members a few questions when they join (e.g. class year, role) to slice
              poll results later. These are set now and can’t be changed after the community is created.
            </p>
          </CardHeader>
          <CardContent>
            <SegmentEditor value={segments} onChange={setSegments} />
          </CardContent>
        </Card>

        <Button type="submit" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create community"}
        </Button>
      </form>
    </div>
  );
}
