"use client";

import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoon } from "@/components/common/ComingSoon";

/** Stub: user-following (FR-USER-004) has no backend yet. */
export function FollowButton() {
  return (
    <ComingSoon label="Following — coming soon">
      <Button variant="outline" size="sm">
        <UserPlus className="h-4 w-4" /> Follow
      </Button>
    </ComingSoon>
  );
}
