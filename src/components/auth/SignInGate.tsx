"use client";

import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "./LoginDialog";

/** Friendly placeholder shown where a signed-out user hits an auth-gated view. */
export function SignInGate({
  title = "Sign in to continue",
  message = "You need an account to do this.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <LogIn className="h-6 w-6" />
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{message}</p>
      <LoginDialog trigger={<Button size="lg">Sign in</Button>} />
    </div>
  );
}
