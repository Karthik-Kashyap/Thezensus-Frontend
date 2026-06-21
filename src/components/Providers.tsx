"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useState } from "react";
import { convex } from "@/lib/convexClient";
import { LiveSlotProvider } from "@/components/feed/LiveSlotProvider";

/**
 * App-wide client providers: Convex (live backend), server-state cache, theme, toasts.
 * React Query stays during the migration — un-migrated domains (polls/comments/communities
 * etc.) still fetch over REST, and useSession keeps its React-Query-era contract.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return (
    <ConvexProvider client={convex}>
      <QueryClientProvider client={client}>
        <LiveSlotProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </ThemeProvider>
        </LiveSlotProvider>
      </QueryClientProvider>
    </ConvexProvider>
  );
}
