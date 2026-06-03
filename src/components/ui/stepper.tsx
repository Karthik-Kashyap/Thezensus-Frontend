import { cn } from "@/lib/utils";

/**
 * Per-step state. The parent maps its own form state onto these:
 *  - complete   → green   (a required step that's satisfied, or an optional step the user filled in)
 *  - incomplete → neutral (a required step still to do)
 *  - optional   → amber   (not required — but worth doing, so it reads as "important, your call")
 */
export type StepStatus = "complete" | "incomplete" | "optional";

export interface Step {
  /** Stable key. */
  id: string;
  /** Title shown beside the circle. */
  label: string;
  /** Small helper line under the label. */
  description?: string;
  status: StepStatus;
}

/** Spoken status for screen readers, so the state isn't conveyed by color alone. */
const STATUS_SR_TEXT: Record<StepStatus, string> = {
  complete: "completed",
  incomplete: "not yet completed",
  optional: "optional",
};

/**
 * Vertical progress rail — numbered circles joined by a connector line. Generic and
 * presentational: it renders whatever steps it's given and owns no state, so it can be
 * reused on any multi-section page (create community, create poll, onboarding, …).
 */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol aria-label="Progress" className={cn("relative", className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const complete = step.status === "complete";
        const optional = step.status === "optional";
        return (
          <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
            {/* Connector down to the next circle — fills green once this step is complete. */}
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-0 left-4 top-8 w-0.5 -translate-x-1/2 rounded-full transition-colors",
                  complete ? "bg-emerald-500" : "bg-border",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors",
                complete && "border-emerald-500 bg-emerald-500 text-white",
                optional &&
                  "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-300",
                !complete && !optional && "border-border bg-card text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <div className="pt-1">
              <p
                className={cn(
                  "text-sm font-medium leading-tight",
                  complete || optional ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
                <span className="sr-only"> — {STATUS_SR_TEXT[step.status]}</span>
              </p>
              {step.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
