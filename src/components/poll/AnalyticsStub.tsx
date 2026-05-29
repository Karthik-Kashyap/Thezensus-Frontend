"use client";

import { BarChart3, Globe, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Creator analytics dashboard (FR-ANAL-*) — backend not built yet. Shown as a preview. */
export function AnalyticsStub() {
  const items = [
    { icon: BarChart3, label: "Votes over time" },
    { icon: Globe, label: "Voter geography" },
    { icon: Clock, label: "Peak voting hours" },
  ];
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-semibold">Analytics</span>
          <Badge variant="outline">Coming soon</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Detailed breakdowns for poll creators are on the way.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.label}
              className="flex flex-col items-center gap-2 rounded-lg bg-muted/50 py-6 text-center text-muted-foreground"
            >
              <it.icon className="h-6 w-6" />
              <span className="text-xs font-medium">{it.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
