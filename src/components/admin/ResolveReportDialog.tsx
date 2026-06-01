"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { resolveReport } from "@/lib/admin";
import { REPORT_RESOLUTION_OPTIONS } from "@/lib/constants";
import type { ReportResolution } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/** Close a report with an outcome. Resolving strips it from the queue (the row persists as history). */
export function ResolveReportDialog({ reportId }: { reportId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<ReportResolution | "">("");

  const mutation = useMutation({
    mutationFn: () => resolveReport(reportId, { resolution: resolution as ReportResolution }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Report resolved");
      setOpen(false);
    },
    onError: (e) => {
      const status = (e as { status?: number }).status;
      toast.error(status === 409 ? "This report is already resolved." : "Couldn’t resolve the report.");
    },
  });

  const selected = REPORT_RESOLUTION_OPTIONS.find((o) => o.value === resolution);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResolution("");
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <CheckCircle2 className="h-4 w-4" /> Resolve
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve this report</DialogTitle>
          <DialogDescription>
            Choose the outcome. This closes the report and removes it from the open queue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="resolution">Outcome</Label>
          <Select
            id="resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as ReportResolution)}
          >
            <option value="">Select an outcome…</option>
            {REPORT_RESOLUTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {selected && <p className="text-xs text-muted-foreground">{selected.hint}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!resolution || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Resolving…" : "Resolve report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
