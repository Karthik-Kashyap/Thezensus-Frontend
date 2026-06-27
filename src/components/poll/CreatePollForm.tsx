"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQuery as useConvexQuery } from "convex/react";
import { toast } from "sonner";
import { Plus, X, Link2, Users, ImagePlus, CalendarClock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { createPoll } from "@/lib/polls";
import { listMySubscriptions, getCommunity } from "@/lib/communities";
import { routes } from "@/lib/constants";
import { formatEditionLabel } from "@/lib/format";
import type { AudienceType, CreatePollInput, PollType, Recurrence } from "@/lib/types";
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

// Poll image upload (question + per-option) is temporarily disabled for users while media
// moderation is finished out (DESIGN-007 Phase B1). The full upload pipeline stays wired —
// flip this to `true` to restore the image pickers. See PollImageInput.
const POLL_IMAGES_ENABLED = false;

// Recurrence cadences offered at creation, grouped for scannability. MANUAL (roll-on-demand) is
// intentionally excluded this phase — it needs a backend "roll" endpoint that doesn't exist yet.
// Every mode here is fully automatic (compute-don't-roll: the edition is a pure function of the
// clock + timezone), so none needs a scheduler. INTERVAL options carry an `intervalMinutes` slot
// length (must match the backend's INTERVAL_MINUTES_ALLOWED); the rest are calendar cadences.
interface CadenceOption {
  key: string; // unique selection id (a recurrence may appear with several intervals)
  label: string;
  recurrence: Recurrence;
  intervalMinutes?: number;
}
const CADENCE_GROUPS: { heading?: string; options: CadenceOption[] }[] = [
  { options: [{ key: "NONE", label: "One-time", recurrence: "NONE" }] },
  {
    heading: "Live",
    options: [
      { key: "INT-10", label: "10 min", recurrence: "INTERVAL", intervalMinutes: 10 },
      { key: "INT-12", label: "12 min", recurrence: "INTERVAL", intervalMinutes: 12 },
      { key: "INT-15", label: "15 min", recurrence: "INTERVAL", intervalMinutes: 15 },
      { key: "INT-30", label: "30 min", recurrence: "INTERVAL", intervalMinutes: 30 },
      { key: "INT-60", label: "1 hour", recurrence: "INTERVAL", intervalMinutes: 60 },
      { key: "INT-120", label: "2 hours", recurrence: "INTERVAL", intervalMinutes: 120 },
      { key: "INT-180", label: "3 hours", recurrence: "INTERVAL", intervalMinutes: 180 },
      { key: "INT-240", label: "4 hours", recurrence: "INTERVAL", intervalMinutes: 240 },
      { key: "INT-480", label: "8 hours", recurrence: "INTERVAL", intervalMinutes: 480 },
      { key: "INT-720", label: "12 hours", recurrence: "INTERVAL", intervalMinutes: 720 },
    ],
  },
  {
    heading: "Live - Calendar",
    options: [
      { key: "DAILY", label: "Daily", recurrence: "DAILY" },
      { key: "WEEKLY", label: "Weekly", recurrence: "WEEKLY" },
      { key: "MONTHLY", label: "Monthly", recurrence: "MONTHLY" },
      { key: "YEARLY", label: "Yearly", recurrence: "YEARLY" },
    ],
  },
];

// A short curated list of common IANA zones; the viewer's detected zone is prepended (and is
// the default) so it's always selectable. The backend re-validates the zone string.
const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function CreatePollForm({ initialCommunityId }: { initialCommunityId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [audience, setAudience] = useState<AudienceType>(initialCommunityId ? "COMMUNITY" : "COMMUNITY");
  const [communityId, setCommunityId] = useState(initialCommunityId ?? "");
  const [question, setQuestion] = useState("");
  // Recurrence cadence + the IANA timezone that decides when each edition rolls over. The
  // timezone select is hidden until a recurring cadence is picked, so seeding it from the
  // server zone during SSR can't cause a hydration mismatch.
  const [recurrence, setRecurrence] = useState<Recurrence>("NONE");
  // Set only for INTERVAL recurrence (the slot length); cleared whenever a non-interval chip is picked.
  const [intervalMinutes, setIntervalMinutes] = useState<number | undefined>(undefined);
  const [timezone, setTimezone] = useState<string>(detectTimezone);
  // Options start pre-filled with Yes / No; creators can edit them or add more via "Add option".
  // The poll type is derived from the final option count at submit (exactly 2 → binary, more → multi),
  // so there's no type toggle to click.
  const [options, setOptions] = useState<OptionRow[]>([
    { key: "o-yes", label: "Yes" },
    { key: "o-no", label: "No" },
  ]);
  // Optional question image (poll_question). Each option carries its own image on the row above.
  const [questionImage, setQuestionImage] = useState<PollImageValue | null>(null);
  // How many image pickers are mid-upload/scan. Blocks Publish until they clear, so a
  // still-scanning image can't be silently dropped from the submitted poll (DESIGN-007).
  const [uploadingImages, setUploadingImages] = useState(0);
  const onImageBusyChange = (busy: boolean) => setUploadingImages((n) => n + (busy ? 1 : -1));

  // Live schedule preview for recurring polls — "60 editions, ends …". Computed server-side by the
  // SAME cap math the create path stamps (api.polls.previewSchedule), so the form never duplicates
  // the timezone-aware date arithmetic. Skipped (no query) for one-off polls.
  const schedulePreview = useConvexQuery(
    api.polls.previewSchedule,
    recurrence === "NONE" ? "skip" : { recurrence, intervalMinutes, timezone },
  ) as { maxEditions: number; endLabel: string } | null | undefined;

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

  function updateOption(key: string, label: string) {
    setOptions((os) => os.map((o) => (o.key === key ? { ...o, label } : o)));
  }

  function setOptionImage(key: string, image: PollImageValue | null) {
    setOptions((os) => os.map((o) => (o.key === key ? { ...o, image } : o)));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = options.map((o) => o.label.trim()).filter(Boolean);
    if (!question.trim()) return toast.error("Add a question.");
    if (audience === "COMMUNITY" && !communityId) return toast.error("Pick a community.");
    if (trimmed.length < 2) return toast.error("Add at least two options.");
    const isRecurring = recurrence !== "NONE";
    if (isRecurring && !timezone) return toast.error("Pick a timezone for the recurring schedule.");

    // Exactly two options is a binary (Yes / No-style) poll; anything more is multiple choice.
    const type: PollType = trimmed.length === 2 ? "binary" : "multi";

    mutation.mutate({
      audienceType: audience,
      communityId: audience === "COMMUNITY" ? communityId : undefined,
      question: question.trim(),
      questionMediaId: questionImage?.mediaId,
      type,
      // Ballot privacy + share-card + topics pickers are removed from the form; default to
      // standard ballots and a results-revealing share card, with no topics.
      ballotMode: "standard",
      recurrence: isRecurring ? recurrence : undefined,
      intervalMinutes: isRecurring && recurrence === "INTERVAL" ? intervalMinutes : undefined,
      timezone: isRecurring ? timezone : undefined,
      options: options
        .filter((o) => o.label.trim())
        .map((o, i) => ({
          id: `opt_${i}`,
          label: o.label.trim(),
          ...(o.image ? { mediaId: o.image.mediaId } : {}),
        })),
      shareCardShowResults: true,
    });
  }

  const canRemove = options.length > 2;
  // Detected/selected zone first, then the common list (deduped).
  const timezoneOptions = Array.from(new Set([timezone, ...COMMON_TIMEZONES]));

  // Progress rail state. Destination + question are the only steps now that ballot privacy /
  // share-card / topics have been removed from the form.
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

            {POLL_IMAGES_ENABLED ? (
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
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <ImagePlus className="h-4 w-4" />
                Images coming soon
              </div>
            )}

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
                  {POLL_IMAGES_ENABLED && (
                    <PollImageInput
                      kind="poll_option"
                      value={o.image ?? null}
                      onChange={(v) => setOptionImage(o.key, v)}
                      onBusyChange={onImageBusyChange}
                      label={`image for option ${i + 1}`}
                      className="h-10 w-10 shrink-0"
                    />
                  )}
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOptions((os) => [...os, newOption()])}
              >
                <Plus className="h-4 w-4" /> Add option
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How often?</CardTitle>
            <p className="text-sm text-muted-foreground">
              A recurring poll resets into a fresh edition each period — every edition keeps its own
              separate results. Recurring polls automatically end after 60 editions.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {CADENCE_GROUPS.map((group, gi) => (
                <div key={group.heading ?? `g-${gi}`} className="space-y-1.5">
                  {group.heading && (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group.heading}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((opt) => (
                      <TypeChip
                        key={opt.key}
                        active={recurrence === opt.recurrence && intervalMinutes === opt.intervalMinutes}
                        onClick={() => {
                          setRecurrence(opt.recurrence);
                          setIntervalMinutes(opt.intervalMinutes);
                        }}
                        label={opt.label}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {recurrence !== "NONE" && (
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <p className="text-xs text-muted-foreground">
                  Decides the clock each edition rolls over on.
                </p>
                <Select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="max-w-sm"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>

                {schedulePreview && (
                  <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Runs {schedulePreview.maxEditions} editions — ends around{" "}
                      <span className="font-medium text-foreground">
                        {formatEditionLabel(recurrence, schedulePreview.endLabel)}
                      </span>
                      .
                    </span>
                  </p>
                )}
              </div>
            )}
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
