"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Link2, Users } from "lucide-react";
import { createPoll } from "@/lib/polls";
import { listMySubscriptions, getCommunity } from "@/lib/communities";
import { routes } from "@/lib/constants";
import type { AudienceType, CreatePollInput, PollType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

let optionSeq = 0;
const newOption = () => ({ key: `o${optionSeq++}`, label: "" });

export function CreatePollForm({ initialCommunityId }: { initialCommunityId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [audience, setAudience] = useState<AudienceType>(initialCommunityId ? "COMMUNITY" : "COMMUNITY");
  const [communityId, setCommunityId] = useState(initialCommunityId ?? "");
  const [question, setQuestion] = useState("");
  const [type, setType] = useState<PollType>("binary");
  const [options, setOptions] = useState([
    { key: "o-a", label: "" },
    { key: "o-b", label: "" },
  ]);

  // Communities the user can post to (their subscriptions).
  const { data: subs } = useQuery({ queryKey: ["subscriptions"], queryFn: listMySubscriptions });

  const mutation = useMutation({
    mutationFn: (input: CreatePollInput) => createPoll(input),
    onSuccess: (poll) => {
      queryClient.invalidateQueries({ queryKey: ["communityPolls", poll.communityId] });
      toast.success("Poll created");
      router.push(routes.poll(poll.pollId));
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      toast.error(status === 403 ? "You must be a member of that community to post." : "Could not create the poll.");
    },
  });

  function setType_(next: PollType) {
    setType(next);
    if (next === "binary" && options.length > 2) setOptions(options.slice(0, 2));
    if (next === "multi" && options.length < 2) setOptions([newOption(), newOption()]);
  }

  function updateOption(key: string, label: string) {
    setOptions((os) => os.map((o) => (o.key === key ? { ...o, label } : o)));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = options.map((o) => o.label.trim()).filter(Boolean);
    if (!question.trim()) return toast.error("Add a question.");
    if (audience === "COMMUNITY" && !communityId) return toast.error("Pick a community.");
    if (trimmed.length < 2) return toast.error("Add at least two options.");

    mutation.mutate({
      audienceType: audience,
      communityId: audience === "COMMUNITY" ? communityId : undefined,
      question: question.trim(),
      type,
      options: options
        .filter((o) => o.label.trim())
        .map((o, i) => ({ id: `opt_${i}`, label: o.label.trim() })),
    });
  }

  const canRemove = type === "multi" && options.length > 2;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Where should this go?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <AudienceCard
              active={audience === "COMMUNITY"}
              onClick={() => setAudience("COMMUNITY")}
              icon={Users}
              title="A community"
              hint="Post to members of a community."
            />
            <AudienceCard
              active={audience === "LINK"}
              onClick={() => setAudience("LINK")}
              icon={Link2}
              title="Share by link"
              hint="Anyone with the link can vote."
            />
          </div>

          {audience === "COMMUNITY" && (
            <div className="space-y-1.5">
              <Label htmlFor="community">Community</Label>
              <Select
                id="community"
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
                required
              >
                <option value="">Select a community…</option>
                {subs?.map((s) => <CommunityOption key={s.communityId} id={s.communityId} />)}
              </Select>
              {subs && subs.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  You haven’t joined any communities yet.{" "}
                  <a href={routes.newCommunity} className="text-primary underline">
                    Create one
                  </a>
                  .
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Ask anything…"
            value={question}
            maxLength={300}
            rows={2}
            onChange={(e) => setQuestion(e.target.value)}
            className="font-display text-lg"
          />

          <div className="flex gap-2">
            <TypeChip active={type === "binary"} onClick={() => setType_("binary")} label="Yes / No" />
            <TypeChip active={type === "multi"} onClick={() => setType_("multi")} label="Multiple choice" />
          </div>

          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={o.key} className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  {String.fromCharCode(65 + i)}
                </span>
                <Input
                  placeholder={`Option ${i + 1}`}
                  value={o.label}
                  maxLength={120}
                  onChange={(e) => updateOption(o.key, e.target.value)}
                />
                {canRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setOptions((os) => os.filter((x) => x.key !== o.key))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {type === "multi" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOptions((os) => [...os, newOption()])}
              >
                <Plus className="h-4 w-4" /> Add option
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={mutation.isPending}>
        {mutation.isPending ? "Publishing…" : "Publish poll"}
      </Button>
    </form>
  );
}

/** Renders a subscribed community's name as an <option>. */
function CommunityOption({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["community", id], queryFn: () => getCommunity(id) });
  return <option value={id}>{data?.name ?? id}</option>;
}

function AudienceCard({
  active,
  onClick,
  icon: Icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-left transition",
        active ? "border-primary bg-accent" : "border-border hover:border-primary/40",
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function TypeChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm font-medium transition",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40",
      )}
    >
      {label}
    </button>
  );
}
