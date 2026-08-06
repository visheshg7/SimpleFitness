/**
 * Muscle intensity and highlight data models.
 *
 * Direct port of `MuscleIntensity.swift`.
 */

import type { Muscle } from '../data/muscle';
import type { MuscleSide } from '../data/muscleSide';
import type { ColorInput } from '../core/color';
import { colorFill, fillFirstColor, type MuscleFill } from './muscleFill';

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/** Represents the intensity level for a specific muscle. */
export class MuscleIntensity {
  readonly muscle: Muscle;
  readonly intensity: number;
  readonly side: MuscleSide;
  readonly color: ColorInput | null;

  /**
   * Creates a muscle intensity entry.
   * - `intensity`: 0.0 (none) to 1.0 (maximum).
   * - `side`: which side of the body (default: both).
   * - `color`: optional override color; if null the heatmap color scale is used.
   */
  constructor(
    muscle: Muscle,
    intensity: number,
    side: MuscleSide = 'both',
    color: ColorInput | null = null
  ) {
    this.muscle = muscle;
    this.intensity = clamp01(intensity);
    this.side = side;
    this.color = color;
  }
}

/** Data model for a highlighted muscle with color and opacity. */
export class MuscleHighlight {
  readonly muscle: Muscle;
  readonly color: ColorInput;
  readonly opacity: number;
  readonly fill: MuscleFill;

  /**
   * Creates a highlight with a solid color (or an explicit fill via
   * `MuscleHighlight.withFill`).
   */
  constructor(
    muscle: Muscle,
    color: ColorInput,
    opacity = 1,
    fill: MuscleFill = colorFill(color)
  ) {
    this.muscle = muscle;
    this.color = color;
    this.opacity = opacity;
    this.fill = fill;
  }

  /** Creates a highlight from an explicit fill and opacity. */
  static withFill(muscle: Muscle, fill: MuscleFill, opacity = 1): MuscleHighlight {
    return new MuscleHighlight(muscle, fillFirstColor(fill), opacity, fill);
  }

  /** A copy of this highlight with a different opacity. */
  withOpacity(opacity: number): MuscleHighlight {
    return new MuscleHighlight(this.muscle, this.color, opacity, this.fill);
  }
}
