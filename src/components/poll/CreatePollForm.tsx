"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Link2, Users, BarChart3, EyeOff } from "lucide-react";
import { createPoll } from "@/lib/polls";
import { listMySubscriptions, getCommunity } from "@/lib/communities";
import { routes } from "@/lib/constants";
import type { AudienceType, BallotMode, CreatePollInput, PollType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper, type Step } from "@/components/ui/stepper";
import { PollImageInput, type PollImageValue } from "./PollImageInput";
import { cn } from "@/lib/utils";

let optionSeq = 0;
type OptionRow = { key: string; label: string; image?: PollImageValue | null };
const newOption = (): OptionRow => ({ key: `o${optionSeq++}`, label: "" });

// Mirror the backend POLL_LIMITS (tagsMax / tagMax) — the create mutation re-validates.
const MAX_TAGS = 10;
const MAX_TAG_LEN = 40;

export function CreatePollForm({ initialCommunityId }: { initialCommunityId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [audience, setAudience] = useState<AudienceType>(initialCommunityId ? "COMMUNITY" : "COMMUNITY");
  const [communityId, setCommunityId] = useState(initialCommunityId ?? "");
  const [question, setQuestion] = useState("");
  const [type, setType] = useState<PollType>("binary");
  const [ballotMode, setBallotMode] = useState<BallotMode>("standard");
  // Default poll type is Yes / No, so the options start pre-filled to match.
  const [options, setOptions] = useState<OptionRow[]>([
    { key: "o-yes", label: "Yes" },
    { key: "o-no", label: "No" },
  ]);
  // Remembers each ballot type's options while the other type is active, so
  // toggling between Yes / No and multiple choice restores whatever was typed.
  const [stashedMulti, setStashedMulti] = useState<OptionRow[] | null>(null);
  const [stashedBinary, setStashedBinary] = useState<OptionRow[] | null>(null);
  // Optional question image (poll_question). Each option carries its own image on the row above.
  const [questionImage, setQuestionImage] = useState<PollImageValue | null>(null);
  // Topics — normalized to bare lowercase tokens (the "#nba" model) so they group + filter
  // cleanly on Discover. Deduped, capped at MAX_TAGS.
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  // Reveal the live result breakdown on the social share card (OG image). Defaults to true —
  // the breakdown is the viral hook; creators can keep it hidden ("vote to see") instead.
  const [showResults, setShowResults] = useState(true);
  // How many image pickers are mid-upload/scan. Blocks Publish until they clear, so a
  // still-scanning image can't be silently dropped from the submitted poll (DESIGN-007).
  const [uploadingImages, setUploadingImages] = useState(0);
  const onImageBusyChange = (busy: boolean) => setUploadingImages((n) => n + (busy ? 1 : -1));

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
    if (next === type) return;
    setType(next);
    if (next === "binary") {
      // Stash the multiple-choice options, restore any earlier Yes / No edits,
      // otherwise pre-fill with Yes / No.
      setStashedMulti(options);
      setOptions(
        stashedBinary ?? [
          { key: "o-yes", label: "Yes" },
          { key: "o-no", label: "No" },
        ],
      );
      setStashedBinary(null);
    } else {
      // Stash the Yes / No options, restore earlier multiple-choice options,
      // otherwise start fresh with two blanks.
      setStashedBinary(options);
      setOptions(stashedMulti ?? [newOption(), newOption()]);
      setStashedMulti(null);
    }
  }

  function updateOption(key: string, label: string) {
    setOptions((os) => os.map((o) => (o.key === key ? { ...o, label } : o)));
  }

  function setOptionImage(key: string, image: PollImageValue | null) {
    setOptions((os) => os.map((o) => (o.key === key ? { ...o, image } : o)));
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
      questionMediaId: questionImage?.mediaId,
      type,
      ballotMode,
      options: options
        .filter((o) => o.label.trim())
        .map((o, i) => ({
          id: `opt_${i}`,
          label: o.label.trim(),
          ...(o.image ? { mediaId: o.image.mediaId } : {}),
        })),
      tags: tags.length ? tags : undefined,
      shareCardShowResults: showResults,
    });
  }

  const canRemove = type === "multi" && options.length > 2;

  // Progress rail state. Destination + question are required; ballot privacy always has a
  // value (defaults to standard), so it reads as satisfied from the start.
  const destinationDone = audience === "LINK" || (audience === "COMMUNITY" && Boolean(communityId));
  const filledOptions = options.filter((o) => o.label.trim()).length;
  const steps: Step[] = [
    {
      id: "destination",
      label: "Where it goes",
      description: "Community or link",
      status: destinationDone ? "complete" : "incomplete",
    },
    {
      id: "question",
      label: "Your question",
      description: "Question & options",
      status: question.trim() && filledOptions >= 2 ? "complete" : "incomplete",
    },
    {
      id: "privacy",
      label: "Ballot privacy",
      description: "Standard or anonymous",
      status: "complete",
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

            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">
                Question image (optional)
              </Label>
              <PollImageInput
                kind="poll_question"
                value={questionImage}
                onChange={setQuestionImage}
                onBusyChange={onImageBusyChange}
                label="question image"
                className="h-32 w-full max-w-sm"
              />
            </div>

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
                  <PollImageInput
                    kind="poll_option"
                    value={o.image ?? null}
                    onChange={(v) => setOptionImage(o.key, v)}
                    onBusyChange={onImageBusyChange}
                    label={`image for option ${i + 1}`}
                    className="h-10 w-10 shrink-0"
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

            <div className="space-y-1.5">
              <Label htmlFor="tags">
                Topics <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Add up to {MAX_TAGS} so people can find this on Discover. Press Enter or comma.
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
                {tags.length < MAX_TAGS && (
                  <input
                    id="tags"
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ballot privacy</CardTitle>
            <p className="text-sm text-muted-foreground">
              This can’t be changed after you publish.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <AudienceCard
                active={ballotMode === "standard"}
                onClick={() => setBallotMode("standard")}
                icon={BarChart3}
                title="Standard"
                hint="Attributable votes — powers demographic analytics."
              />
              <AudienceCard
                active={ballotMode === "anonymous"}
                onClick={() => setBallotMode("anonymous")}
                icon={EyeOff}
                title="Anonymous"
                hint="Unlinkable votes — no analytics, and votes can’t be changed."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>When shared</CardTitle>
            <p className="text-sm text-muted-foreground">
              How the preview card looks when this poll is shared on social.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <AudienceCard
                active={showResults}
                onClick={() => setShowResults(true)}
                icon={BarChart3}
                title="Reveal results"
                hint="The share card shows the live vote breakdown."
              />
              <AudienceCard
                active={!showResults}
                onClick={() => setShowResults(false)}
                icon={EyeOff}
                title="Keep hidden"
                hint="The card shows just the question — vote to see results."
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" disabled={mutation.isPending || uploadingImages > 0}>
          {mutation.isPending
            ? "Publishing…"
            : uploadingImages > 0
              ? "Processing image…"
              : "Publish poll"}
        </Button>
      </form>
    </div>
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
