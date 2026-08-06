/**
 * Body path data and view-box configuration.
 *
 * Direct port of `BodyPathData.swift`.
 */

import type { BodyGender, BodySide } from './muscleSide';
import type { BodySlug } from './muscle';
import { maleFrontPaths } from './paths/maleFront';
import { maleBackPaths } from './paths/maleBack';
import { femaleFrontPaths } from './paths/femaleFront';
import { femaleBackPaths } from './paths/femaleBack';

/** SVG path data for a single body part (common/left/right sub-paths). */
export interface BodyPartPathData {
  slug: BodySlug;
  common?: string[];
  left?: string[];
  right?: string[];
}

/** All SVG path strings for a body part, combined. */
export function allPathsOf(bodyPart: BodyPartPathData): string[] {
  return [
    ...(bodyPart.common ?? []),
    ...(bodyPart.left ?? []),
    ...(bodyPart.right ?? []),
  ];
}

/** View-box configuration for body rendering. */
export interface BodyViewBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** A unit point (0–1) used for gradient directions and anchors. */
export interface UnitPoint {
  x: number;
  y: number;
}

export const UNIT_TOP: UnitPoint = { x: 0.5, y: 0 };
export const UNIT_BOTTOM: UnitPoint = { x: 0.5, y: 1 };
export const UNIT_LEADING: UnitPoint = { x: 0, y: 0.5 };
export const UNIT_TRAILING: UnitPoint = { x: 1, y: 0.5 };
export const UNIT_CENTER: UnitPoint = { x: 0.5, y: 0.5 };

export const VIEW_BOXES: Record<`${BodyGender}-${BodySide}`, BodyViewBox> = {
  'male-front': { originX: 0, originY: 95, width: 727, height: 1280 },
  'male-back': { originX: 718, originY: 95, width: 727, height: 1280 },
  'female-front': { originX: 0, originY: 0, width: 650, height: 1450 },
  'female-back': { originX: 823, originY: 0, width: 650, height: 1450 },
};

/** Provides body path data for a given gender and side. */
export function pathsFor(gender: BodyGender, side: BodySide): BodyPartPathData[] {
  switch (`${gender}-${side}`) {
    case 'male-front':
      return maleFrontPaths;
    case 'male-back':
      return maleBackPaths;
    case 'female-front':
      return femaleFrontPaths;
    case 'female-back':
      return femaleBackPaths;
    default:
      throw new Error(`MuscleMap: unknown gender/side combination: ${gender}-${side}`);
  }
}

/** Provides the view box for a given gender and side. */
export function viewBoxFor(gender: BodyGender, side: BodySide): BodyViewBox {
  return VIEW_BOXES[`${gender}-${side}` as `${BodyGender}-${BodySide}`];
}

/**
 * Computes the uniform scale and offsets used to fit the body view box into a
 * container of the given size (matches the Swift `BodyRenderer` layout math).
 */
export function computeLayout(
  viewBox: BodyViewBox,
  size: { width: number; height: number }
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(size.width / viewBox.width, size.height / viewBox.height);
  const offsetX = (size.width - viewBox.width * scale) / 2 - viewBox.originX * scale;
  const offsetY = (size.height - viewBox.height * scale) / 2 - viewBox.originY * scale;
  return { scale, offsetX, offsetY };
}
