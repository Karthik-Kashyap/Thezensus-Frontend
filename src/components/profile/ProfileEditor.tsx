"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateMe } from "@/lib/profile";
import { GENDER_OPTIONS, NOTIF_CHANNELS } from "@/lib/constants";
import type { MeProfile, UpdateProfileInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FormState {
  bio: string;
  gender: string;
  region: string;
  demographicsPublic: boolean;
  notifPrefs: string[];
}

export function ProfileEditor({ user }: { user: MeProfile }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromProfile(user));

  useEffect(() => setForm(fromProfile(user)), [user]);

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMe(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      toast.success("Profile saved");
    },
    onError: () => toast.error("Save failed — check your input."),
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleNotif(channel: string) {
    set(
      "notifPrefs",
      form.notifPrefs.includes(channel)
        ? form.notifPrefs.filter((c) => c !== channel)
        : [...form.notifPrefs, channel],
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: UpdateProfileInput = {
      bio: form.bio,
      region: form.region,
      demographicsPublic: form.demographicsPublic,
      notifPrefs: form.notifPrefs,
    };
    if (form.gender) input.gender = form.gender;
    mutation.mutate(input);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Handle</Label>
            <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
              {user.handle || user.linkId.slice(0, 12)}
            </p>
            <p className="text-xs text-muted-foreground">
              Your public identity. Auto-assigned and not editable — we don’t show real names.
            </p>
          </div>
          <Field label="Bio" htmlFor="bio">
            <Textarea
              id="bio"
              maxLength={280}
              rows={3}
              placeholder="A line about you…"
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demographics</CardTitle>
          <p className="text-sm text-muted-foreground">
            Powers poll analytics only when you enable demographic consent under Privacy &amp; consent
            below. Hidden from your public profile unless you opt in here.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gender" htmlFor="gender">
              <Select id="gender" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Prefer not to say</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Region" htmlFor="region">
              <Input
                id="region"
                maxLength={16}
                placeholder="US-CA"
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
              />
            </Field>
          </div>
          {user.demographics.age != null && (
            <p className="text-sm text-muted-foreground">
              Age: <span className="font-medium text-foreground">{user.demographics.age}</span>{" "}
              <span className="text-xs">— set from your date of birth at sign-up and not editable.</span>
            </p>
          )}
          <Toggle
            checked={form.demographicsPublic}
            onChange={(v) => set("demographicsPublic", v)}
            label="Show my demographics on my public profile"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTIF_CHANNELS.map((channel) => (
            <Toggle
              key={channel}
              checked={form.notifPrefs.includes(channel)}
              onChange={() => toggleNotif(channel)}
              label={`${channel[0].toUpperCase()}${channel.slice(1)} notifications`}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

function fromProfile(me: MeProfile): FormState {
  return {
    bio: me.bio ?? "",
    gender: me.demographics.gender ?? "",
    region: me.demographics.region ?? "",
    demographicsPublic: me.demographics.demographicsPublic,
    notifPrefs: me.settings.notifPrefs ?? [],
  };
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      <span className="text-foreground">{label}</span>
    </label>
  );
}
