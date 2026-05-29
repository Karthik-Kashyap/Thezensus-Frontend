"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createCommunity, subscribe } from "@/lib/communities";
import { VISIBILITY_OPTIONS, routes } from "@/lib/constants";
import type { CreateCommunityInput, Visibility } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CreateCommunityForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");

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
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      visibility,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
        <CardContent className="space-y-3">
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setVisibility(opt.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition",
                visibility === opt.value
                  ? "border-primary bg-accent"
                  : "border-border hover:border-primary/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                  visibility === opt.value ? "border-primary" : "border-muted-foreground/40",
                )}
              >
                {visibility === opt.value && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-sm text-muted-foreground">{opt.hint}</span>
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating…" : "Create community"}
      </Button>
    </form>
  );
}
