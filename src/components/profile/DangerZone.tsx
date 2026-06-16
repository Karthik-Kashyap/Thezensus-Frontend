"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteMe } from "@/lib/profile";
import { logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CONFIRM_WORD = "DELETE";

/**
 * Account erasure (FOUNDATION-02). Irreversible, so it requires typing a confirmation word. The
 * backend severs identity + cascades the linkId-keyed footprint; a 409 means an active legal hold
 * blocks deletion.
 */
export function DangerZone() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: () => deleteMe(),
    onSuccess: async () => {
      // The account is severed server-side, but the session cookie + Convex token are
      // still live — end the session explicitly or the UI stays "signed in".
      await logout();
      queryClient.clear();
      toast.success("Your account has been deleted.");
      router.push("/");
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      toast.error(
        status === 409
          ? "Your account can’t be deleted right now — a legal hold is active. Contact support."
          : "Couldn’t delete your account. Please try again.",
      );
    },
  });

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Delete account</CardTitle>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and remove your votes, subscriptions, and uploads. Polls’
          anonymous aggregate counts are preserved. This can’t be undone.
        </p>
      </CardHeader>
      <CardContent>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setConfirm("");
          }}
        >
          <DialogTrigger asChild>
            <Button variant="destructive" className="gap-1.5">
              <Trash2 className="h-4 w-4" /> Delete my account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This is permanent. Type <span className="font-semibold text-foreground">{CONFIRM_WORD}</span>{" "}
                to confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-delete">Confirmation</Label>
              <Input
                id="confirm-delete"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={confirm !== CONFIRM_WORD || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Deleting…" : "Permanently delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
