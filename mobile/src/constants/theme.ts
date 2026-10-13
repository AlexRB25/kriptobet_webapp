export const Colors = {
  background: '#0A0D0C',
  surface: '#121816',
  surfaceRaised: '#1B2421',
  border: '#26322E',
  text: '#FFFFFF',
  textSecondary: '#8FA39B',
  // Brand green; labels on top of it use the background color.
  accent: '#1FDF7A',
  accentSoft: 'rgba(31, 223, 122, 0.16)',
  accentDeep: '#0F7A43',
  gold: '#F5B83D',
  goldSoft: 'rgba(245, 184, 61, 0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.15)',
  // Roulette and card suits.
  red: '#E0373F',
  black: '#171717',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 14,
  large: 22,
  pill: 999,
} as const;
