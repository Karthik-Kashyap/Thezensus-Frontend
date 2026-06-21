import { cn } from "@/lib/utils";

/**
 * Single source of truth for page content width. Every page wraps its content in this so widths
 * stay consistent and live in ONE place — to retune the whole app, change the values here.
 *
 *  - "standard" (default): the reading width used by feeds, polls, profiles, settings, etc.
 *  - "wide": for pages that carry an extra side rail (the create-poll / create-community steppers),
 *    so the form column itself ends up roughly as wide as standard content once the rail is subtracted.
 */
const WIDTHS = {
  standard: "max-w-4xl",
  wide: "max-w-6xl",
} as const;

export function PageContainer({
  size = "standard",
  className,
  children,
}: {
  size?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto w-full", WIDTHS[size], className)}>{children}</div>;
}
