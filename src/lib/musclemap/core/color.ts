/**
 * Color utilities for the web port of MuscleMap.
 *
 * Mirrors `Color+Extensions.swift` (interpolation + cross-platform helpers) and
 * the subset of SwiftUI `Color` that the library uses (named colors, system
 * colors, `Color(white:)` and `Color(red:green:blue:)` constructors).
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ColorInput = RGBA | string;

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  orange: '#ffa500',
  yellow: '#ffff00',
  green: '#008000',
  blue: '#0000ff',
  cyan: '#00ffff',
  teal: '#008080',
  purple: '#800080',
  pink: '#ffc0cb',
  magenta: '#ff00ff',
  brown: '#a52a2a',
  gray: '#808080',
  grey: '#808080',
  clear: 'rgba(0,0,0,0)',
  transparent: 'rgba(0,0,0,0)',
  none: 'rgba(0,0,0,0)',
};

/** Clamps a value into [0, 1]. */
function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/** Normalizes a 0–255 channel to 0–1. */
function channel(v: number): number {
  return clamp01(v / 255);
}

function hexToRgba(hex: string): RGBA {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6 && h.length !== 8) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: channel(r), g: channel(g), b: channel(b), a };
}

const FUNCTIONAL_RGB =
  /^(?:rgba?|hsla?)\(\s*([^)]+)\)\s*$/i;

function functionalToRgba(value: string): RGBA {
  const m = FUNCTIONAL_RGB.exec(value);
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  const nums = parts.map((p) => parseFloat(p));
  const isHsl = /^hsl/i.test(m[0]);
  if (isHsl) {
    const [h, s, l, a = 1] = nums;
    return hslToRgba(h, s, l, a);
  }
  const [r, g, b, a = 1] = nums;
  const alpha = typeof a === 'number' && a <= 1 ? a : a / 100;
  return {
    r: clamp01(r / 255),
    g: clamp01(g / 255),
    b: clamp01(b / 255),
    a: clamp01(alpha),
  };
}

function hslToRgba(h: number, s: number, l: number, a: number): RGBA {
  const sat = clamp01(s / 100);
  const light = clamp01(l / 100);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = light - c / 2;
  return { r: clamp01(r + m), g: clamp01(g + m), b: clamp01(b + m), a: clamp01(a) };
}

/**
 * Parses a color into normalized RGBA components (0–1 channels).
 * Accepts RGBA objects, hex (`#rgb`, `#rrggbb`, `#rrggbbaa`), CSS named colors,
 * and `rgb()`/`rgba()`/`hsl()`/`hsla()` strings.
 */
export function parseColor(value: ColorInput): RGBA {
  if (typeof value !== 'string') {
    const v = value;
    return { r: clamp01(v.r), g: clamp01(v.g), b: clamp01(v.b), a: clamp01(v.a) };
  }
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return hexToRgba(trimmed);
  if (trimmed.startsWith('rgb') || trimmed.startsWith('hsl')) {
    return functionalToRgba(trimmed);
  }
  const named = NAMED_COLORS[trimmed.toLowerCase()];
  if (named) return parseColor(named);
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Serializes a color to a CSS `rgba()` string. */
export function toCss(color: ColorInput): string {
  const c = parseColor(color);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(
    c.b * 255
  )}, ${c.a})`;
}

/** Linearly interpolates between two colors (0.0 – 1.0). */
export function interpolateColor(
  from: ColorInput,
  to: ColorInput,
  fraction: number
): RGBA {
  const f = clamp01(fraction);
  const a = parseColor(from);
  const b = parseColor(to);
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
    a: a.a + (b.a - a.a) * f,
  };
}

/** Creates an RGBA color from red/green/blue components (0–1 each). */
export function rgb(r: number, g: number, b: number, a = 1): RGBA {
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

/** Creates an RGBA color from a white component (0–1), like `Color(white:)`. */
export function fromWhite(white: number, a = 1): RGBA {
  const w = clamp01(white);
  return { r: w, g: w, b: w, a: clamp01(a) };
}

/** Creates an RGBA color from 0–255 channels. */
export function rgb255(r: number, g: number, b: number, a = 1): RGBA {
  return { r: channel(r), g: channel(g), b: channel(b), a: clamp01(a) };
}

/** Default fill gray (white 0.78), matching `Color.mmDefaultFill`. */
export const MM_DEFAULT_FILL = fromWhite(0.78);
/** Light fill gray (white 0.85), matching `Color.mmLightFill`. */
export const MM_LIGHT_FILL = fromWhite(0.85);
/** Lighter fill gray (white 0.88), matching `Color.mmLighterFill`. */
export const MM_LIGHTER_FILL = fromWhite(0.88);
/** Medium fill gray (white 0.7), matching `Color.mmMediumFill`. */
export const MM_MEDIUM_FILL = fromWhite(0.7);
