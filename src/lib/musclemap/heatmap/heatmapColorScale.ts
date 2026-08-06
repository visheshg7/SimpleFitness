/**
 * Heatmap color scales.
 *
 * Direct port of `HeatmapColorScale.swift`.
 */

import { ColorInterpolation } from './colorInterpolation';
import {
  interpolateColor,
  fromWhite,
  MM_DEFAULT_FILL,
  type ColorInput,
  type RGBA,
} from '../core/color';

/**
 * A color scale that maps an intensity (0.0 – 1.0) to a color, optionally
 * through an interpolation curve.
 */
export class HeatmapColorScale {
  /** The list of colors from low to high intensity. */
  readonly colors: ColorInput[];

  /** The interpolation curve applied to intensity values before color mapping. */
  readonly interpolation: ColorInterpolation;

  constructor(
    colors: ColorInput[],
    interpolation: ColorInterpolation = ColorInterpolation.linear
  ) {
    this.colors = colors;
    this.interpolation = interpolation;
  }

  /** Interpolates a color based on an intensity value (0.0 – 1.0). */
  colorFor(intensity: number): RGBA {
    if (this.colors.length === 0) {
      return { r: 0.5, g: 0.5, b: 0.5, a: 1 }; // `.gray`
    }
    if (this.colors.length === 1) {
      return {
        ...interpolateColor(this.colors[0], this.colors[0], 1),
      };
    }

    const clamped = Math.min(Math.max(intensity, 0), 1);
    const curved = this.interpolation.apply(clamped);
    const scaledIndex = curved * (this.colors.length - 1);
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(lowerIndex + 1, this.colors.length - 1);
    const fraction = scaledIndex - lowerIndex;

    if (fraction < 0.01) {
      return { ...interpolateColor(this.colors[lowerIndex], this.colors[lowerIndex], 1) };
    }
    return interpolateColor(this.colors[lowerIndex], this.colors[upperIndex], fraction);
  }

  equals(other: HeatmapColorScale): boolean {
    if (this.colors.length !== other.colors.length) return false;
    for (let i = 0; i < this.colors.length; i++) {
      const a = interpolateColor(this.colors[i], this.colors[i], 1);
      const b = interpolateColor(other.colors[i], other.colors[i], 1);
      if (a.r !== b.r || a.g !== b.g || a.b !== b.b || a.a !== b.a) return false;
    }
    return this.interpolation.equals(other.interpolation);
  }

  /** Default workout intensity: gray -> yellow -> orange -> red. */
  static readonly workout = new HeatmapColorScale([
    MM_DEFAULT_FILL,
    '#ffff00',
    '#ffa500',
    '#ff0000',
  ]);

  /** Cool to warm: blue -> green -> yellow -> red. */
  static readonly thermal = new HeatmapColorScale([
    '#0000ff',
    '#008000',
    '#ffff00',
    '#ff0000',
  ]);

  /** Medical style: green -> yellow -> red. */
  static readonly medical = new HeatmapColorScale(['#008000', '#ffff00', '#ff0000']);

  /** Monochrome: light gray -> dark. */
  static readonly monochrome = new HeatmapColorScale([fromWhite(0.85), fromWhite(0.15)]);

  /** Workout with 5 discrete steps instead of smooth gradient. */
  static readonly workoutStepped = new HeatmapColorScale(
    [MM_DEFAULT_FILL, '#ffff00', '#ffa500', '#ff0000'],
    ColorInterpolation.step(5)
  );

  /** Thermal with smooth ease-in-out curve. */
  static readonly thermalSmooth = new HeatmapColorScale(
    ['#0000ff', '#008000', '#ffff00', '#ff0000'],
    ColorInterpolation.easeInOut
  );
}
