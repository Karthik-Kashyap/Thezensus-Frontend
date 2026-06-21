import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/layout/Nav";
import { Sidebar } from "@/components/layout/Sidebar";
import { AccountGate } from "@/components/moderation/AccountGate";

// Display: a warm optical serif — serious enough for orgs, friendly for social.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz"],
  display: "swap",
});

// UI/body: a clean geometric sans (deliberately not Inter/Roboto).
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thezensus — Settle anything. Ask everyone.",
  description: "Create a poll on anything. Vote on everything. The world's opinion, counted.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>
          <div className="bg-mesh">
            <Nav />
            <div className="mx-auto flex w-full max-w-[1600px] gap-0">
              <Sidebar />
              {/* Width is set per page via <PageContainer> (single source of truth in that file),
                  so pages can pick "standard" or "wide" — main just fills the center column. */}
              <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
                <AccountGate>{children}</AccountGate>
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
