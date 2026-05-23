"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// React Query provider (DESIGN-001 §9 state management). staleTime 30s globally.
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  // TODO(DESIGN §4.2): Amplify.configure(amplifyConfig) once Cognito env values exist.
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
