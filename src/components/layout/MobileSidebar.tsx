"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./Sidebar";

/**
 * Mobile entry point to the sidebar: a hamburger (shown only below `md`) that opens the same
 * `SidebarNav` content as a left slide-in drawer. The desktop rail stays hidden on mobile, so this
 * is how small screens reach Home / Your communities / Discover. Closes itself on navigation.
 */
export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Tapping any link inside navigates; close the drawer once the route actually changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        aria-label="Open menu"
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] overflow-y-auto border-r border-border/70 bg-background px-3 py-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left md:hidden">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close menu"
            className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-md text-muted-foreground opacity-70 transition hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
          <SidebarNav />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
