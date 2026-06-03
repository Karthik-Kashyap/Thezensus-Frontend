"use client";

import { Globe, Eye, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { VISIBILITY_OPTIONS } from "@/lib/constants";
import type { Visibility } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Icon per visibility level — globe = open, eye = view-only, lock = closed. */
const ICONS: Record<Visibility, LucideIcon> = {
  public: Globe,
  protected: Eye,
  private: Lock,
};

const OPTIONS = VISIBILITY_OPTIONS.map((o) => ({ ...o, Icon: ICONS[o.value] }));

/** Compact 3-up picker for who can join a community. Every label + hint stays visible. */
export function VisibilityField({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (value: Visibility) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {OPTIONS.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition",
            value === opt.value
              ? "border-primary bg-accent ring-1 ring-primary"
              : "border-border hover:border-primary/40",
          )}
        >
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg transition-colors",
              value === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            <opt.Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">{opt.label}</span>
          <span className="text-xs leading-snug text-muted-foreground">{opt.hint}</span>
        </button>
      ))}
    </div>
  );
}
