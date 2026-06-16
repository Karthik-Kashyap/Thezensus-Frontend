"use client";

import { useState } from "react";
import { googleLoginUrl } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Sign-in entry point. The only path is Google OAuth — a real top-level navigation to the
 * backend start URL, which sets the session cookie and returns the user where they started.
 * `returnTo` defaults to the current page, so sign-in brings the user back in place; pass an
 * explicit path (e.g. a specific poll) to override.
 */
export function LoginDialog({
  trigger,
  returnTo,
}: {
  trigger: React.ReactNode;
  returnTo?: string;
}) {
  const [open, setOpen] = useState(false);

  // Default to wherever the user is now (client-only; the dialog body renders post-hydration).
  const target =
    returnTo ??
    (typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Thezensus</DialogTitle>
          <DialogDescription>Sign in to create polls, vote, and comment.</DialogDescription>
        </DialogHeader>

        <Button asChild size="lg" className="w-full">
          <a href={googleLoginUrl(target)}>Continue with Google</a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
