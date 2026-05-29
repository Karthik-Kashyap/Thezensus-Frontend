"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { devLogin, googleLoginUrl } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sign-in entry point. Primary path is Google OAuth (a real top-level navigation to the
 * backend start URL). Below it, a local dev stand-in that sets the same session cookie.
 */
export function LoginDialog({
  trigger,
  redirectTo = "/me",
}: {
  trigger: React.ReactNode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await devLogin(email.trim(), name.trim() || undefined);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setOpen(false);
      toast.success("Signed in");
      router.push(redirectTo);
    } catch {
      toast.error("Login failed — is the backend running?");
    } finally {
      setBusy(false);
    }
  }

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

        <div className="relative my-1 text-center">
          <span className="bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
            or, for local dev
          </span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
        </div>

        <form onSubmit={handleDevLogin} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dev-email">Email</Label>
            <Input
              id="dev-email"
              type="email"
              placeholder="alice@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-name">Display name (optional)</Label>
            <Input
              id="dev-name"
              placeholder="Alice"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Dev sign-in"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
