import Link from "next/link";
import { routes } from "@/lib/constants";

/**
 * A member reference inside the moderation tools. Roles/bans carry only the member's `linkId`
 * (ADR-006 pseudonym), not a display name, so we render the id as a monospace chip that links to
 * their public profile and truncate the middle for readability (full id on hover).
 */
export function MemberLink({ linkId, className }: { linkId: string; className?: string }) {
  const short = linkId.length > 16 ? `${linkId.slice(0, 8)}…${linkId.slice(-4)}` : linkId;
  return (
    <Link
      href={routes.profile(linkId)}
      title={linkId}
      className={`font-mono text-sm text-foreground hover:text-primary hover:underline ${className ?? ""}`}
    >
      {short}
    </Link>
  );
}
