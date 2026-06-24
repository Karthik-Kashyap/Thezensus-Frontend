"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatCountdown } from "@/lib/format";

/**
 * "next poll in 4h 36m" — a live countdown to a recurring poll's next edition. The boundary
 * (`at`, epoch ms) is computed server-side in the poll's timezone (editions.logic →
 * nextEditionStart); this just ticks down to it locally. Renders nothing until mounted, so
 * the server and first client paint agree (no hydration flash), and nothing once the boundary
 * passes (the edition has rolled — a fresh boundary arrives with the next query snapshot).
 */
export function NextEditionCountdown({ at, className }: { at: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null || at <= now) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap ${className ?? ""}`}
      title="Time until this poll's next edition opens"
    >
      <Clock className="h-3 w-3" />
      next poll in {formatCountdown(at - now)}
    </span>
  );
}
