"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { logout } from "@/lib/auth";
import { fileAppeal } from "@/lib/moderation";
import type { MeProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Full-page block shown when the signed-in account is SUSPENDED or BANNED (the gateway returns 403
 * on most routes; GET /users/me — which carries this status — logout, and appeals stay reachable).
 * The user can read why, file one appeal, and sign out.
 */
export function SuspendedScreen({ account }: { account: MeProfile["account"] }) {
  const [reason, setReason] = useState("");
  const [appealed, setAppealed] = useState(false);
  const banned = account.status === "BANNED";

  const appeal = useMutation({
    mutationFn: () => fileAppeal(reason.trim() || undefined),
    onSuccess: () => {
      setAppealed(true);
      toast.success("Appeal submitted. We’ll review it and follow up by email.");
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      if (status === 409) {
        setAppealed(true);
        toast.message("You already have an appeal under review.");
      } else {
        toast.error("Couldn’t submit your appeal. Please try again.");
      }
    },
  });

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="border-destructive/30">
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">
            {banned ? "Your account is banned" : "Your account is suspended"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {banned
              ? "This is a permanent action. You can’t create polls, vote, or comment."
              : "While suspended, you can’t create polls, vote, or comment."}
            {!banned && account.until && (
              <>
                {" "}
                Your suspension is scheduled to lift on{" "}
                <span className="font-medium text-foreground">
                  {new Date(account.until).toLocaleString()}
                </span>
                .
              </>
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {account.reason && (
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium">Reason given: </span>
              {account.reason}
            </div>
          )}

          {appealed ? (
            <p className="text-sm text-muted-foreground">
              Your appeal is under review. There’s nothing more to do for now.
            </p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="appeal" className="text-sm font-medium">
                Think this was a mistake? File an appeal.
              </label>
              <Textarea
                id="appeal"
                rows={4}
                maxLength={1000}
                placeholder="Explain why we should reconsider…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button onClick={() => appeal.mutate()} disabled={appeal.isPending}>
                {appeal.isPending ? "Submitting…" : "Submit appeal"}
              </Button>
            </div>
          )}

          <div className="border-t pt-4">
            <Button variant="ghost" onClick={() => logout().then(() => window.location.assign("/"))}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
