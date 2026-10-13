"use client";

import { useSyncExternalStore } from "react";
import type { SlipSelection } from "./types";

// The bet slip lives in the browser (it survives reloads) and is shared by every component
// that calls `useSlip`.

const STORAGE_KEY = "kriptobet.boleto";
const EMPTY: SlipSelection[] = [];
const listeners = new Set<() => void>();
let current: SlipSelection[] | null = null;

function read(): SlipSelection[] {
  if (current === null) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      current = Array.isArray(saved) ? saved : [];
    } catch {
      // A corrupt slip is simply dropped.
      current = [];
    }
  }
  return current;
}

function write(next: SlipSelection[]) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the slip still works until the page is closed.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const slip = {
  /** Adds the pick, or removes it if it is already there. A pick replaces another one of the same event. */
  toggle(selection: SlipSelection) {
    const old = read();
    write(
      old.some((item) => item.oddsId === selection.oddsId)
        ? old.filter((item) => item.oddsId !== selection.oddsId)
        : [...old.filter((item) => item.eventId !== selection.eventId), selection],
    );
  },
  remove: (oddsId: string) => write(read().filter((item) => item.oddsId !== oddsId)),
  clear: () => write([]),
  /** Replaces prices after the server said they changed. A pick without a price is closed: it leaves the slip. */
  reprice(prices: Map<string, number>) {
    write(
      read()
        .filter((item) => prices.has(item.oddsId))
        .map((item) => ({ ...item, price: prices.get(item.oddsId)! })),
    );
  },
};

/** Picks currently in the slip (empty during server rendering). */
export const useSlip = () => useSyncExternalStore(subscribe, read, () => EMPTY);
