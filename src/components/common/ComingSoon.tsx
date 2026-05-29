"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Wraps a not-yet-functional control (a BRD feature the backend doesn't expose yet) so the
 * layout reflects the full product vision without ever pretending the control works.
 * The child is rendered non-interactive; hovering explains it's coming.
 */
export function ComingSoon({
  label = "Coming soon",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="relative inline-flex cursor-not-allowed opacity-60 [&_*]:pointer-events-none"
            aria-disabled
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
