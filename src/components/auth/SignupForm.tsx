"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { completeSignup } from "@/lib/signup";
import type { CompleteSignupInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Rejection = "under_age" | "no_pending" | null;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Compose day/month/year into ISO yyyy-mm-dd, or null if not a real past date. */
function toBirthDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || year.length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  const isReal =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!isReal || y < 1900 || date.getTime() > Date.now()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Step 2 of first-time Google sign-in (ADR-008/009): collect a date of birth + baseline consent,
 * then POST /auth/signup/complete to actually create the account. The server enforces the 13+ gate
 * (403 → nothing stored) and requires the signup-pending cookie set by the OAuth callback
 * (a 400 means there's no pending signup — the user must start sign-in again).
 */
export function SignupForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [demographics, setDemographics] = useState(false);
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [rejection, setRejection] = useState<Rejection>(null);

  const mutation = useMutation({
    mutationFn: (input: CompleteSignupInput) => completeSignup(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Welcome to Pollzens!");
      router.push(returnTo ?? "/me");
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      if (status === 403) setRejection("under_age");
      else if (status === 400) setRejection("no_pending");
      else toast.error("Couldn’t complete sign-up. Please try again.");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const birthDate = toBirthDate(birthDay, birthMonth, birthYear);
    if (!birthDate) return toast.error("Please enter a valid date of birth.");
    mutation.mutate({
      birthDate,
      consent: { demographics, marketingEmail },
    });
  }

  if (rejection === "under_age") {
    return (
      <Rejected
        icon={<CalendarClock className="h-6 w-6" />}
        title="You need to be 13 or older"
        body="Thanks for your interest. Pollzens isn’t available to people under 13, so we couldn’t
              create your account. Nothing was saved."
      />
    );
  }

  if (rejection === "no_pending") {
    return (
      <Rejected
        icon={<CalendarClock className="h-6 w-6" />}
        title="Let’s start over"
        body="This sign-up link has expired or was opened directly. Please start sign-in again."
        action={
          <Button onClick={() => router.push("/")} className="mt-4">
            Back to sign in
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">One last step</CardTitle>
        <p className="text-sm text-muted-foreground">
          Confirm a few details to finish setting up your account.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="birthDay">Date of birth</Label>
            <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
              <Select
                aria-label="Month"
                required
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
              >
                <option value="" disabled>
                  Month
                </option>
                {MONTHS.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </Select>
              <Input
                id="birthDay"
                aria-label="Day"
                required
                inputMode="numeric"
                maxLength={2}
                placeholder="DD"
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value.replace(/\D/g, ""))}
              />
              <Input
                aria-label="Year"
                required
                inputMode="numeric"
                maxLength={4}
                placeholder="YYYY"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Used once to confirm you’re 13+ and to power age-based poll analytics. We store it
              privately — it’s never shown on your profile.
            </p>
          </div>

          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Your choices</legend>
            <Consent
              checked={demographics}
              onChange={setDemographics}
              label="Use my demographics in poll analytics"
              hint="Lets your votes contribute to aggregate, anonymized breakdowns (e.g. by region). You can change this anytime."
            />
            <Consent
              checked={marketingEmail}
              onChange={setMarketingEmail}
              label="Send me occasional product emails"
              hint="News and updates. No spam — unsubscribe anytime."
            />
          </fieldset>

          <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating your account…" : "Create account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By continuing you confirm you’re at least 13 years old.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function Consent({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
      />
      <span>
        <span className="block font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function Rejected({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <h1 className="font-display text-xl font-semibold">{title}</h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
        {action}
      </CardContent>
    </Card>
  );
}
