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
 * backend start URL, which sets the session cookie and returns the user to /me (or /signup
 * for a first-timer).
 */
export function LoginDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Thezensus</DialogTitle>
          <DialogDescription>Sign in to create polls, vote, and comment.</DialogDescription>
        </DialogHeader>

        <Button asChild size="lg" className="w-full">
          <a href={googleLoginUrl}>Continue with Google</a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
