"use client";

import { useSyncExternalStore } from "react";

// Game sounds synthesised with the Web Audio API: no audio files to load.

const STORAGE_KEY = "kriptobet.sonido";
const listeners = new Set<() => void>();
let muted: boolean | null = null;
let context: AudioContext | null = null;

function isMuted() {
  if (muted === null) {
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function toggleSound() {
  muted = !isMuted();
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
  } catch {
    // The choice simply lasts until the page is closed.
  }
  listeners.forEach((listener) => listener());
}

/** True when sounds are on (always true during server rendering). */
export const useSoundOn = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => !isMuted(),
    () => true,
  );

type Note = { at: number; freq: number; length: number; type?: OscillatorType; gain?: number; slideTo?: number };

function tones(notes: Note[]) {
  if (isMuted() || typeof window === "undefined") return;
  try {
    context ??= new AudioContext();
    // Browsers keep the context suspended until the first tap; every sound here follows one.
    void context.resume();
    const start = context.currentTime;
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = note.type ?? "sine";
      oscillator.frequency.setValueAtTime(note.freq, start + note.at);
      if (note.slideTo) oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, start + note.at + note.length);
      volume.gain.setValueAtTime(note.gain ?? 0.12, start + note.at);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
      oscillator.connect(volume).connect(context.destination);
      oscillator.start(start + note.at);
      oscillator.stop(start + note.at + note.length + 0.02);
    }
  } catch {
    // No audio device, or the browser refused: the game goes on in silence.
  }
}

export const sound = {
  /** A chip placed or a button of the table. */
  chip: () => tones([{ at: 0, freq: 1900, length: 0.05, type: "triangle", gain: 0.08 }, { at: 0.03, freq: 1300, length: 0.06, type: "triangle", gain: 0.06 }]),
  /** A card sliding onto the felt. */
  card: () => tones([{ at: 0, freq: 520, length: 0.07, type: "sawtooth", gain: 0.04, slideTo: 180 }]),
  /** A reel stopping or the ball hopping a pocket. */
  tick: () => tones([{ at: 0, freq: 900, length: 0.04, type: "square", gain: 0.05 }]),
  /** Something starts turning. */
  spin: () => tones([{ at: 0, freq: 220, length: 0.5, type: "sawtooth", gain: 0.04, slideTo: 660 }]),
  /** A safe tile. */
  gem: () => tones([{ at: 0, freq: 1320, length: 0.12, gain: 0.1 }, { at: 0.07, freq: 1760, length: 0.16, gain: 0.08 }]),
  win: () => tones([523, 659, 784, 1047].map((freq, index) => ({ at: index * 0.09, freq, length: 0.22, type: "triangle" as const }))),
  bigWin: () =>
    tones([523, 659, 784, 1047, 784, 1047, 1319].map((freq, index) => ({ at: index * 0.1, freq, length: 0.28, type: "triangle" as const, gain: 0.14 }))),
  lose: () => tones([{ at: 0, freq: 300, length: 0.28, type: "sine", gain: 0.1, slideTo: 140 }]),
  boom: () => tones([{ at: 0, freq: 160, length: 0.5, type: "sawtooth", gain: 0.18, slideTo: 40 }, { at: 0, freq: 90, length: 0.6, type: "square", gain: 0.1, slideTo: 30 }]),
};

/** Sound for the end of a round, by how much it paid compared with the bet. */
export function outcomeSound(payout: number, bet: number) {
  if (payout >= bet * 10) sound.bigWin();
  else if (payout > bet) sound.win();
  else if (payout < bet) sound.lose();
}
