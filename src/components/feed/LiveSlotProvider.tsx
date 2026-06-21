// React bindings for the live-slot store (DESIGN-010 §2). The provider owns one store for
// the app; `useLiveSlot` runs a card's IntersectionObserver + dwell/grace timers, registers
// it with the store, and reports back whether the card currently holds a (normal or pinned)
// live slot. Cards subscribe to their OWN id via useSyncExternalStore, so a scroll that flips
// one card's liveness never re-renders the rest of the feed.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createLiveSlotStore, type LiveSlotStore } from "@/lib/liveSlotStore";
import { LIVE_FEED } from "@/lib/constants";

const LiveSlotContext = createContext<LiveSlotStore | null>(null);

/** Thresholds at which the observer re-evaluates visibility (coarse is enough). */
const THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

export function LiveSlotProvider({ children }: { children: ReactNode }) {
  // One store for the lifetime of the app; created lazily so SSR doesn't touch the DOM.
  const storeRef = useRef<LiveSlotStore | null>(null);
  if (storeRef.current === null) storeRef.current = createLiveSlotStore(LIVE_FEED.maxLiveCards);
  return <LiveSlotContext.Provider value={storeRef.current}>{children}</LiveSlotContext.Provider>;
}

export interface LiveSlot {
  /** Attach to the card's root element so its on-screen position can be tracked. */
  ref: (el: HTMLElement | null) => void;
  /** True only once the card has dwelled AND been granted a slot (or is pinned + visible). */
  isLive: boolean;
  /** Call on a successful cast/change — pins this card so the voter can watch results live. */
  onVoted: () => void;
}

export function useLiveSlot(pollId: string): LiveSlot {
  const store = useContext(LiveSlotContext);
  const enabled = LIVE_FEED.enabled && store !== null;

  // Track the element in STATE (not a ref) so the observe-effect re-runs the moment the card's
  // DOM node attaches. The old ref version ran the effect once and could see a null ref, so the
  // IntersectionObserver was never created and the card never went live.
  const [el, setEl] = useState<HTMLElement | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setRef = useCallback((node: HTMLElement | null) => setEl(node), []);

  // Register / unregister this card with the store for its lifetime.
  useEffect(() => {
    if (!enabled) return;
    store!.register(pollId);
    return () => store!.unregister(pollId);
  }, [enabled, store, pollId]);

  // Observe the card once its element is attached; dwell → candidate, grace on exit.
  useEffect(() => {
    if (!enabled || !el) return;
    store!.setEl(pollId, el);

    const clearTimers = () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (graceTimer.current) clearTimeout(graceTimer.current);
      dwellTimer.current = graceTimer.current = null;
    };

    const handle: IntersectionObserverCallback = (entries) => {
      const e = entries[entries.length - 1];
      const cardFrac = e.boundingClientRect.height > 0
        ? e.intersectionRect.height / e.boundingClientRect.height
        : 0;
      const viewFrac = e.rootBounds && e.rootBounds.height > 0
        ? e.intersectionRect.height / e.rootBounds.height
        : 0;
      // A card taller than the viewport can never cover half of ITSELF, so we also accept
      // "covers half the viewport" — either makes it meaningfully on screen.
      const meaningful =
        e.isIntersecting &&
        (cardFrac >= LIVE_FEED.visibleFraction || viewFrac >= LIVE_FEED.visibleFraction);

      if (meaningful) {
        store!.setVisible(pollId, true);
        if (graceTimer.current) {
          clearTimeout(graceTimer.current);
          graceTimer.current = null;
        }
        // Dwell: only after staying on screen for DWELL_MS does it compete for a slot.
        if (!dwellTimer.current) {
          dwellTimer.current = setTimeout(() => {
            dwellTimer.current = null;
            store!.setCandidate(pollId, true);
          }, LIVE_FEED.dwellMs);
        }
      } else {
        if (dwellTimer.current) {
          clearTimeout(dwellTimer.current);
          dwellTimer.current = null;
        }
        // Exit grace: release visibility/candidacy/pin only after a short delay (anti-thrash).
        if (!graceTimer.current) {
          graceTimer.current = setTimeout(() => {
            graceTimer.current = null;
            store!.setVisible(pollId, false);
            store!.setCandidate(pollId, false);
            store!.unpin(pollId);
          }, LIVE_FEED.exitGraceMs);
        }
      }
    };

    const observer = new IntersectionObserver(handle, { threshold: THRESHOLDS });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimers();
    };
  }, [enabled, store, pollId, el]);

  const isLive = useSyncExternalStore(
    useCallback(
      (cb: () => void) => (enabled ? store!.subscribe(pollId, cb) : () => {}),
      [enabled, store, pollId],
    ),
    () => (enabled ? store!.isLive(pollId) : false),
    () => false,
  );

  const onVoted = useCallback(() => {
    if (enabled) store!.pin(pollId);
  }, [enabled, store, pollId]);

  return { ref: setRef, isLive, onVoted };
}
