/**
 * Describes how a muscle region should be filled.
 *
 * Direct port of `MuscleFill.swift`.
 */

import { parseColor, type ColorInput, type RGBA } from '../core/color';
import type { UnitPoint } from '../data/bodyPathData';

export type MuscleFill =
  | { kind: 'color'; color: ColorInput }
  | {
      kind: 'linearGradient';
      colors: ColorInput[];
      startPoint: UnitPoint;
      endPoint: UnitPoint;
    }
  | {
      kind: 'radialGradient';
      colors: ColorInput[];
      center: UnitPoint;
      startRadius: number;
      endRadius: number;
    };

/** Creates a solid color fill. */
export function colorFill(color: ColorInput): MuscleFill {
  return { kind: 'color', color };
}

/** Creates a linear gradient fill. */
export function linearGradientFill(
  colors: ColorInput[],
  startPoint: UnitPoint,
  endPoint: UnitPoint
): MuscleFill {
  return { kind: 'linearGradient', colors, startPoint, endPoint };
}

/** Creates a radial gradient fill. */
export function radialGradientFill(
  colors: ColorInput[],
  center: UnitPoint,
  startRadius: number,
  endRadius: number
): MuscleFill {
  return { kind: 'radialGradient', colors, center, startRadius, endRadius };
}

/**
 * Resolves a muscle fill to the concrete colors it represents.
 * Used for cross-fade animations (the first color of a gradient stands in).
 */
export function fillFirstColor(fill: MuscleFill): RGBA {
  switch (fill.kind) {
    case 'color':
      return colorToRgba(fill.color);
    case 'linearGradient':
    case 'radialGradient':
      return colorToRgba(fill.colors[0] ?? '#00000000');
  }
}

function colorToRgba(color: ColorInput): RGBA {
  return parseColor(color);
}

/** Whether two fills are the same simple kind (used for animation blending). */
export function sameFillKind(a: MuscleFill, b: MuscleFill): boolean {
  return a.kind === b.kind;
}
