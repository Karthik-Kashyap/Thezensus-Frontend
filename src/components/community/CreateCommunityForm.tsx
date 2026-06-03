"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
    onError: () => toast.error("Could not create the community."),
  });

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
