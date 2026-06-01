import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/AdminGate";

export const metadata: Metadata = {
  title: "Moderation — Thezensus",
  robots: { index: false, follow: false },
};

/** Every /admin route is gated to platform admins by the shared AdminGate. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
