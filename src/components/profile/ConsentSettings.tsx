"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { getConsent, updateConsent } from "@/lib/consent";
import type { UpdateConsentInput } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Consent ledger controls (ADR-009). Each toggle PUTs the single changed purpose. Toggling
 * `demographics` also re-syncs the flag the vote path reads, so we invalidate ["me"] too. The
 * 13+ affirmation is captured at signup and shown read-only here.
 */
export function ConsentSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["consent"], queryFn: getConsent });

  const mutation = useMutation({
    mutationFn: (input: UpdateConsentInput) => updateConsent(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["consent"], updated);
      // The demographics consent flag is mirrored onto the profile — keep /me fresh.
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Preferences saved");
    },
    onError: () => toast.error("Couldn’t save that change."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy & consent</CardTitle>
        <p className="text-sm text-muted-foreground">
          You control how your data is used. Changes apply going forward.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <ConsentRow
              label="Demographic analytics"
              hint="Let your votes contribute to anonymized, aggregate breakdowns (e.g. by country/age)."
              checked={data.purposes.demographics}
              disabled={mutation.isPending}
              onChange={(v) => mutation.mutate({ demographics: v })}
            />
            <ConsentRow
              label="Product emails"
              hint="Occasional news and updates. Unsubscribe anytime."
              checked={data.purposes.marketing_email}
              disabled={mutation.isPending}
              onChange={(v) => mutation.mutate({ marketingEmail: v })}
            />
            <div className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Age 13+ confirmed at sign-up.
              <span className="ml-auto text-xs">Policy version {data.policyVersion}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ConsentRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary disabled:opacity-50"
      />
      <span>
        <span className="block font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
