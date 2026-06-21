// The live-slot store (DESIGN-010 §2) — pure, framework-agnostic bookkeeping for which
// feed cards may hold a live `editionCounts` subscription. The React bindings (provider +
// useLiveSlot hook + IntersectionObserver) live in components/feed/LiveSlotProvider.tsx;
// this file owns only the admission policy so it stays testable without a DOM.
//
// Policy:
//   • NORMAL slots: a card becomes a `candidate` after dwelling on screen; the topmost
//     `maxLiveCards` candidates (by on-screen position) hold a slot. No preemption — a
//     freed slot (card scrolled out) goes to the next-topmost waiting candidate.
//   • PINNED (just-voted): a card the user voted on gets a live slot OUTSIDE the cap while
//     it stays visible, so the voter can watch results. Pins never consume a normal slot.
//
// `isLive(pollId)` = holds a normal slot OR (pinned AND visible). Listeners are notified
// per-poll, and only when THAT poll's liveness flips — so a feed of N cards never does an
// N-wide re-render on scroll (each card subscribes to its own id via useSyncExternalStore).

interface CardEntry {
  el: HTMLElement | null;
  /** Meaningfully on screen (post exit-grace). Gates pins. */
  visible: boolean;
  /** Visible AND has dwelled long enough to compete for a normal slot. */
  candidate: boolean;
  /** Just-voted override — live while visible, outside the cap. */
  pinned: boolean;
}

export interface LiveSlotStore {
  register(pollId: string): void;
  unregister(pollId: string): void;
  setEl(pollId: string, el: HTMLElement | null): void;
  setVisible(pollId: string, visible: boolean): void;
  setCandidate(pollId: string, candidate: boolean): void;
  pin(pollId: string): void;
  unpin(pollId: string): void;
  subscribe(pollId: string, cb: () => void): () => void;
  isLive(pollId: string): boolean;
}

export function createLiveSlotStore(maxLiveCards: number): LiveSlotStore {
  const cards = new Map<string, CardEntry>();
  const listeners = new Map<string, Set<() => void>>();
  let live = new Set<string>();

  const entry = (pollId: string): CardEntry => {
    let c = cards.get(pollId);
    if (!c) {
      c = { el: null, visible: false, candidate: false, pinned: false };
      cards.set(pollId, c);
    }
    return c;
  };

  /** Topmost-first by on-screen position; cards without a measured element sort last. */
  const top = (c: CardEntry): number =>
    c.el ? c.el.getBoundingClientRect().top : Number.POSITIVE_INFINITY;

  function recompute(): void {
    // Normal slots: the topmost `maxLiveCards` candidates win. Pinned cards are NOT excluded
    // here — so pinning never changes the normal-slot grants (a topmost reader is never
    // evicted). A pin only ever ADDS a connection, and only when the pinned card isn't already
    // among the top `maxLiveCards` (below).
    const granted = [...cards.entries()]
      .filter(([, c]) => c.candidate)
      .sort((a, b) => top(a[1]) - top(b[1]))
      .slice(0, maxLiveCards)
      .map(([id]) => id);

    const next = new Set<string>(granted);
    // Just-voted cards are live while visible — an EXTRA connection outside the cap, but a
    // no-op if the card already holds a normal slot (Set dedupes).
    for (const [id, c] of cards) if (c.pinned && c.visible) next.add(id);

    // Commit the new live set BEFORE notifying. useSyncExternalStore reads getSnapshot
    // SYNCHRONOUSLY inside its change handler, so if `live` isn't already updated the
    // subscriber re-reads the OLD value, sees "no change", and skips the re-render. (That
    // was the bug: the slot was granted and the listener notified, yet the card never went
    // live.) Diff against the captured previous set so we still notify only what changed.
    const prev = live;
    live = next;
    for (const id of next) if (!prev.has(id)) notify(id);
    for (const id of prev) if (!next.has(id)) notify(id);
  }

  function notify(pollId: string): void {
    const ls = listeners.get(pollId);
    if (ls) for (const cb of ls) cb();
  }

  return {
    register(pollId) {
      entry(pollId);
    },
    unregister(pollId) {
      cards.delete(pollId);
      recompute();
    },
    setEl(pollId, el) {
      entry(pollId).el = el;
    },
    setVisible(pollId, visible) {
      const c = entry(pollId);
      if (c.visible === visible) return;
      c.visible = visible;
      recompute();
    },
    setCandidate(pollId, candidate) {
      const c = entry(pollId);
      if (c.candidate === candidate) return;
      c.candidate = candidate;
      recompute();
    },
    pin(pollId) {
      const c = entry(pollId);
      if (c.pinned) return;
      c.pinned = true;
      recompute();
    },
    unpin(pollId) {
      const c = entry(pollId);
      if (!c.pinned) return;
      c.pinned = false;
      recompute();
    },
    subscribe(pollId, cb) {
      let ls = listeners.get(pollId);
      if (!ls) {
        ls = new Set();
        listeners.set(pollId, ls);
      }
      ls.add(cb);
      return () => {
        ls!.delete(cb);
        if (ls!.size === 0) listeners.delete(pollId);
      };
    },
    isLive(pollId) {
      return live.has(pollId);
    },
  };
}
