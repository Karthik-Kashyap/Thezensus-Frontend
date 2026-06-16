"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const GAP = 8; // space between the trigger and the popup
const EDGE = 8; // min gap from the viewport edge

/**
 * Inline "what does this mean?" affordance. Shows `content` on hover for mouse users and on
 * click/tap for touch users (where tooltips never fire). Wrap a small trigger — e.g. a Badge —
 * as the child. The popup opens to the RIGHT, flips to the left when it would overflow, and is
 * clamped to the viewport, so it never runs off-screen. Closes on outside tap, Escape, or scroll.
 */
export function InfoHint({
  content,
  children,
  className,
}: {
  content: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  // Place the popup against the trigger using measured rects + fixed positioning, so it isn't
  // clipped by any overflow-hidden ancestor and can flip/clamp to stay on-screen. Runs before
  // paint (useLayoutEffect) to avoid a flash at the wrong spot.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !popRef.current) return;
    const t = btnRef.current.getBoundingClientRect();
    const p = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = t.right + GAP; // prefer the right side
    if (left + p.width > vw - EDGE) {
      // No room on the right → try the left; if that overflows too, pin within the viewport.
      const leftSide = t.left - GAP - p.width;
      left = leftSide >= EDGE ? leftSide : Math.max(EDGE, vw - EDGE - p.width);
    }
    let top = t.top + t.height / 2 - p.height / 2; // vertically centered on the trigger
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - EDGE - p.height));

    setPos({ top, left });
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const inRoot = rootRef.current?.contains(e.target as Node);
      const inPop = popRef.current?.contains(e.target as Node);
      if (!inRoot && !inPop) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // Fixed to the trigger's position — if the page scrolls/resizes, just close rather than drift.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Reopening: clear stale coords so the popup stays hidden until repositioned for this open.
  const show = () => {
    setPos(null);
    setOpen(true);
  };

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex", className)}
      // Hover only for mouse — touch taps go through the click handler so the popup is reachable.
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={content}
        aria-expanded={open}
        className="inline-flex cursor-help"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
      >
        {children}
      </button>
      {open && (
        <span
          ref={popRef}
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-50 w-64 max-w-[calc(100vw-1rem)] cursor-default rounded-lg border border-border bg-popover px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed text-popover-foreground shadow-lg"
        >
          {content}
        </span>
      )}
    </span>
  );
}
