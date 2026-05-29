"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoon } from "@/components/common/ComingSoon";

/** Stub: the notifications inbox (FR-NOTIF-*) needs a backend that doesn't exist yet. */
export function NotificationsBell() {
  return (
    <ComingSoon label="Notifications — coming soon">
      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell className="h-5 w-5" />
      </Button>
    </ComingSoon>
  );
}
