import { useSyncExternalStore } from 'react';

import type { SlipSelection } from '@/lib/types';

// The bet slip, shared by every screen that calls `useSlip`. It lives in memory: closing the app empties it.

const listeners = new Set<() => void>();
let current: SlipSelection[] = [];

function write(next: SlipSelection[]) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const slip = {
  /** Adds the pick, or removes it if it is already there. A pick replaces another one of the same event. */
  toggle(selection: SlipSelection) {
    write(
      current.some((item) => item.oddsId === selection.oddsId)
        ? current.filter((item) => item.oddsId !== selection.oddsId)
        : [...current.filter((item) => item.eventId !== selection.eventId), selection],
    );
  },
  remove: (oddsId: string) => write(current.filter((item) => item.oddsId !== oddsId)),
  clear: () => write([]),
  /** Replaces prices after the server said they changed. A pick without a price is closed: it leaves the slip. */
  reprice(prices: Map<string, number>) {
    write(current.filter((item) => prices.has(item.oddsId)).map((item) => ({ ...item, price: prices.get(item.oddsId)! })));
  },
};

export const useSlip = () => useSyncExternalStore(subscribe, () => current);
