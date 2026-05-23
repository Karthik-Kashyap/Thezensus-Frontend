import type { Metadata } from "next";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "VoteAnything",
  description: "Create a poll on anything. Vote on everything.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {/* TODO(DESIGN §9): global nav with AuthButton + notification bell (P1) */}
          {children}
        </Providers>
      </body>
    </html>
  );
}
