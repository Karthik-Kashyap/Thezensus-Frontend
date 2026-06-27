"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { allCountries } from "country-region-data";
import { updateMe } from "@/lib/profile";
import { GENDER_OPTIONS } from "@/lib/constants";
import type { MeProfile, UpdateProfileInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// country-region-data ships tuples: country = [name, isoCode, regions]; region = [name, isoCode].
// Sorted by display name for the picker. Static data, so computed once at module load.
const COUNTRIES = [...allCountries].sort((a, b) => a[0].localeCompare(b[0]));

interface FormState {
  bio: string;
  gender: string;
  country: string; // ISO-3166-1 alpha-2, e.g. "US"
  state: string; // ISO-3166-2, e.g. "US-CA"
}

export function ProfileEditor({ user }: { user: MeProfile }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromProfile(user));
  // The sign-up email is shown only here, and masked until the user reveals it.
  const [showEmail, setShowEmail] = useState(false);

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

  // Subdivisions of the selected country that carry an ISO code — the state picker's options.
  // Changing country resets state so a stale "US-CA" can't survive a switch to another country.
  const stateOptions = useMemo(() => {
    const country = COUNTRIES.find((c) => c[1] === form.country);
    return country ? country[2].filter((r) => r[1]) : [];
  }, [form.country]);

  function setCountry(code: string) {
    setForm((f) => ({ ...f, country: code, state: "" }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: UpdateProfileInput = {
      bio: form.bio,
      country: form.country,
      state: form.state,
      // Demographics are never shown on the public profile (the opt-in toggle was removed).
      demographicsPublic: false,
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
          <div className="space-y-1.5">
            <Label>Email</Label>
            <div className="flex items-center gap-2">
              <p className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
                {showEmail ? user.settings.email : maskEmail(user.settings.email)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowEmail((v) => !v)}
                aria-label={showEmail ? "Hide email" : "Show email"}
              >
                {showEmail ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showEmail ? "Hide" : "Show"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The email you signed up with. Only ever shown here, to you.
            </p>
          </div>
          <Field label="Bio" htmlFor="bio">
            <Textarea
              id="bio"
              maxLength={280}
              rows={3}
              placeholder="Share something about yourself — but keep it anonymous, no details that could identify you."
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
            Powers anonymized, aggregate poll analytics. Never shown on your public profile.
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
            <Field label="Country" htmlFor="country">
              <Select id="country" value={form.country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Prefer not to say</option>
                {COUNTRIES.map((c) => (
                  <option key={c[1]} value={c[1]}>
                    {c[0]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="State / Region" htmlFor="state">
              <Select
                id="state"
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                disabled={stateOptions.length === 0}
              >
                <option value="">
                  {form.country ? "Prefer not to say" : "Select a country first"}
                </option>
                {stateOptions.map((r) => (
                  <option key={r[1]} value={`${form.country}-${r[1]}`}>
                    {r[0]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {user.demographics.age != null && (
            <p className="text-sm text-muted-foreground">
              Age: <span className="font-medium text-foreground">{user.demographics.age}</span>{" "}
              <span className="text-xs">— set from your date of birth at sign-up and not editable.</span>
            </p>
          )}
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

/** Mask an email for the default (hidden) state, e.g. "ka•••@•••" — never reveals the full address. */
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(local.length - 2, 3))}@${"•".repeat(Math.max(domain.length, 3))}`;
}

function fromProfile(me: MeProfile): FormState {
  return {
    bio: me.bio ?? "",
    gender: me.demographics.gender ?? "",
    country: me.demographics.country ?? "",
    state: me.demographics.state ?? "",
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
