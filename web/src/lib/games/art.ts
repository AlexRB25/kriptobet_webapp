// Drawings used by the games, as SVG source. The web shows them as images; the app renders the
// same source with react-native-svg.
// The mobile app keeps a copy in mobile/src/lib/art.ts — change both.

import type { SlotSymbol } from "./types.ts";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

/** Points of a star centred on (cx, cy). */
function star(cx: number, cy: number, outer: number, inner: number) {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

export const SLOT_ART: Record<SlotSymbol, string> = {
  cherry: svg(`
    <defs><radialGradient id="a" cx="35%" cy="30%"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".55" stop-color="#e01f2d"/><stop offset="1" stop-color="#8f0d18"/></radialGradient></defs>
    <path d="M33 62 C36 38 52 22 72 14" fill="none" stroke="#2f7d32" stroke-width="5" stroke-linecap="round"/>
    <path d="M68 66 C66 42 68 26 72 14" fill="none" stroke="#2f7d32" stroke-width="5" stroke-linecap="round"/>
    <path d="M72 14 C84 8 94 14 96 26 C84 30 76 24 72 14Z" fill="#43a047"/>
    <circle cx="32" cy="70" r="21" fill="url(#a)"/><circle cx="68" cy="74" r="21" fill="url(#a)"/>
    <ellipse cx="25" cy="62" rx="6" ry="4" fill="#fff" opacity=".55"/><ellipse cx="61" cy="66" rx="6" ry="4" fill="#fff" opacity=".55"/>`),
  lemon: svg(`
    <defs><radialGradient id="a" cx="38%" cy="32%"><stop offset="0" stop-color="#fff9a8"/><stop offset=".6" stop-color="#ffd91f"/><stop offset="1" stop-color="#c79a00"/></radialGradient></defs>
    <g transform="rotate(-28 50 52)">
      <path d="M10 52 C16 40 28 26 50 26 C72 26 84 40 92 52 C84 64 72 78 50 78 C28 78 16 64 10 52Z" fill="url(#a)" stroke="#b58900" stroke-width="2"/>
      <ellipse cx="40" cy="40" rx="13" ry="6" fill="#fff" opacity=".5"/>
    </g>
    <path d="M70 20 C80 10 92 12 96 22 C86 28 76 26 70 20Z" fill="#43a047"/>`),
  orange: svg(`
    <defs><radialGradient id="a" cx="36%" cy="30%"><stop offset="0" stop-color="#ffd08a"/><stop offset=".6" stop-color="#ff8c1a"/><stop offset="1" stop-color="#b85300"/></radialGradient></defs>
    <circle cx="50" cy="56" r="36" fill="url(#a)" stroke="#a84a00" stroke-width="2"/>
    <ellipse cx="37" cy="41" rx="11" ry="6" fill="#fff" opacity=".45"/>
    <path d="M50 22 C56 8 72 6 80 14 C72 24 60 26 50 22Z" fill="#43a047"/>
    <circle cx="50" cy="23" r="3" fill="#5d4037"/>`),
  bell: svg(`
    <defs><linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#b7791f"/><stop offset=".35" stop-color="#ffe27a"/><stop offset=".6" stop-color="#f5b83d"/><stop offset="1" stop-color="#a86a10"/></linearGradient></defs>
    <circle cx="50" cy="14" r="7" fill="none" stroke="#c58a1a" stroke-width="5"/>
    <path d="M50 18 C28 18 26 42 24 58 C22 70 14 72 12 78 L88 78 C86 72 78 70 76 58 C74 42 72 18 50 18Z" fill="url(#a)" stroke="#8a5a0c" stroke-width="2"/>
    <rect x="10" y="76" width="80" height="8" rx="4" fill="#c58a1a"/>
    <circle cx="50" cy="90" r="7" fill="#8a5a0c"/>
    <path d="M38 28 C32 38 32 52 31 62" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>`),
  star: svg(`
    <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".5" stop-color="#ffc928"/><stop offset="1" stop-color="#d98a00"/></linearGradient></defs>
    <polygon points="${star(50, 53, 44, 19)}" fill="url(#a)" stroke="#b56f00" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="${star(50, 53, 26, 11)}" fill="#fff" opacity=".28"/>`),
  diamond: svg(`
    <polygon points="24,18 76,18 96,42 50,94 4,42" fill="#29b6f6" stroke="#0277bd" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="24,18 38,42 4,42" fill="#81d4fa"/><polygon points="24,18 50,18 38,42" fill="#b3e5fc"/>
    <polygon points="50,18 76,18 62,42" fill="#4fc3f7"/><polygon points="76,18 96,42 62,42" fill="#0288d1"/>
    <polygon points="38,42 62,42 50,94" fill="#4fc3f7"/><polygon points="4,42 38,42 50,94" fill="#039be5"/>
    <polygon points="62,42 96,42 50,94" fill="#0277bd"/><polygon points="50,18 62,42 38,42" fill="#e1f5fe"/>`),
  seven: svg(`
    <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".5" stop-color="#e01f2d"/><stop offset="1" stop-color="#8f0d18"/></linearGradient></defs>
    <path d="M14 12 L88 12 L88 30 L52 92 L26 92 L60 34 L32 34 L32 42 L14 42Z" fill="url(#a)" stroke="#ffd54a" stroke-width="5" stroke-linejoin="round"/>
    <path d="M20 18 L82 18 L82 22 L20 22Z" fill="#fff" opacity=".4"/>`),
};

/** Safe tile of the mines game. */
export const GEM_ART = svg(`
  <polygon points="24,20 76,20 94,42 50,92 6,42" fill="#1fdf7a" stroke="#0f7a43" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="24,20 38,42 6,42" fill="#8af5bd"/><polygon points="24,20 50,20 38,42" fill="#c9fbe0"/>
  <polygon points="50,20 76,20 62,42" fill="#5eeaa0"/><polygon points="76,20 94,42 62,42" fill="#14b060"/>
  <polygon points="38,42 62,42 50,92" fill="#5eeaa0"/><polygon points="6,42 38,42 50,92" fill="#19c96c"/>
  <polygon points="62,42 94,42 50,92" fill="#0f9a52"/><polygon points="50,20 62,42 38,42" fill="#eafff3"/>`);

export const BOMB_ART = svg(`
  <defs><radialGradient id="a" cx="35%" cy="30%"><stop offset="0" stop-color="#6b6b6b"/><stop offset=".6" stop-color="#1f1f1f"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
  <path d="M62 30 C66 16 76 12 84 16" fill="none" stroke="#8d6e63" stroke-width="5" stroke-linecap="round"/>
  <polygon points="${star(86, 14, 12, 5)}" fill="#ffc928"/><circle cx="86" cy="14" r="4" fill="#ff5722"/>
  <rect x="50" y="24" width="20" height="14" rx="3" fill="#3a3a3a" transform="rotate(20 60 31)"/>
  <circle cx="46" cy="60" r="34" fill="url(#a)"/>
  <ellipse cx="33" cy="46" rx="9" ry="6" fill="#fff" opacity=".35"/>`);

/** Rocket of the crash game, pointing up and to the right. */
export const ROCKET_ART = svg(`
  <g transform="rotate(45 50 50)">
    <path d="M42 78 C40 90 46 96 50 100 C54 96 60 90 58 78Z" fill="#ff9800"/><path d="M46 78 C45 86 48 90 50 93 C52 90 55 86 54 78Z" fill="#ffeb3b"/>
    <path d="M36 60 L22 80 L38 74Z" fill="#e01f2d"/><path d="M64 60 L78 80 L62 74Z" fill="#e01f2d"/>
    <path d="M50 4 C66 20 68 50 62 78 L38 78 C32 50 34 20 50 4Z" fill="#eceff1" stroke="#90a4ae" stroke-width="2"/>
    <path d="M50 4 C58 12 62 22 63 32 L37 32 C38 22 42 12 50 4Z" fill="#e01f2d"/>
    <circle cx="50" cy="46" r="9" fill="#29b6f6" stroke="#546e7a" stroke-width="3"/>
  </g>`);

/** Chip colours by value, highest first. Bets are shown as stacks of these. */
export const CHIP_VALUES = [
  { value: 100, color: "#212121", edge: "#f5b83d" },
  { value: 25, color: "#1b8a4b", edge: "#ffffff" },
  { value: 5, color: "#c62828", edge: "#ffffff" },
  { value: 1, color: "#1565c0", edge: "#ffffff" },
  { value: 0.5, color: "#6d4c41", edge: "#ffffff" },
  { value: 0.1, color: "#757575", edge: "#ffffff" },
];

/** Colour of the chip that best represents an amount. */
export const chipFor = (amount: number) => CHIP_VALUES.find((chip) => amount >= chip.value) ?? CHIP_VALUES[CHIP_VALUES.length - 1];

/** Breaks an amount into at most `limit` chips, highest values first. */
export function chipStack(amount: number, limit = 6) {
  const stack: (typeof CHIP_VALUES)[number][] = [];
  let left = Math.round(amount * 100);
  for (const chip of CHIP_VALUES) {
    const cents = Math.round(chip.value * 100);
    while (left >= cents && stack.length < limit) {
      stack.push(chip);
      left -= cents;
    }
  }
  return stack.length ? stack : [CHIP_VALUES[CHIP_VALUES.length - 1]];
}

export const artUrl = (source: string) => `data:image/svg+xml;utf8,${encodeURIComponent(source)}`;
