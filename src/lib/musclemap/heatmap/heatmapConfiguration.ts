/**
 * Heatmap configuration and gradient direction.
 *
 * Direct port of `HeatmapConfiguration.swift`.
 */

import { HeatmapColorScale } from './heatmapColorScale';
import { ColorInterpolation } from './colorInterpolation';
import type { UnitPoint } from '../data/bodyPathData';
import {
  UNIT_TOP,
  UNIT_BOTTOM,
  UNIT_LEADING,
  UNIT_TRAILING,
} from '../data/bodyPathData';

/** The direction of an intra-muscle gradient fill. */
export type GradientDirection =
  | 'topToBottom'
  | 'bottomToTop'
  | 'leftToRight'
  | 'rightToLeft';

const DIRECTION_POINTS: Record<
  GradientDirection,
  { startPoint: UnitPoint; endPoint: UnitPoint }
> = {
  topToBottom: { startPoint: UNIT_TOP, endPoint: UNIT_BOTTOM },
  bottomToTop: { startPoint: UNIT_BOTTOM, endPoint: UNIT_TOP },
  leftToRight: { startPoint: UNIT_LEADING, endPoint: UNIT_TRAILING },
  rightToLeft: { startPoint: UNIT_TRAILING, endPoint: UNIT_LEADING },
};

/** Start unit point for a gradient direction. */
export function gradientStartPoint(direction: GradientDirection): UnitPoint {
  return DIRECTION_POINTS[direction].startPoint;
}

/** End unit point for a gradient direction. */
export function gradientEndPoint(direction: GradientDirection): UnitPoint {
  return DIRECTION_POINTS[direction].endPoint;
}

/** Configuration for heatmap rendering behavior. */
export class HeatmapConfiguration {
  /** The color scale used to map intensity values to colors. */
  colorScale: HeatmapColorScale;

  /** The interpolation curve for the color scale. */
  interpolation: ColorInterpolation;

  /**
   * Minimum intensity threshold. Muscles below this value are not highlighted.
   * `null` shows all muscles (default).
   */
  threshold: number | null;

  /** Whether to fill muscles with an intra-muscle gradient based on intensity. */
  isGradientFillEnabled: boolean;

  /** The direction of the intra-muscle gradient. */
  gradientDirection: GradientDirection;

  /**
   * Factor for the low end of the intra-muscle gradient (0.0 – 1.0).
   * For example, 0.3 means the low color is at 30% of the muscle's intensity.
   */
  gradientLowIntensityFactor: number;

  constructor(
    colorScale: HeatmapColorScale = HeatmapColorScale.workout,
    interpolation: ColorInterpolation = ColorInterpolation.linear,
    threshold: number | null = null,
    isGradientFillEnabled = false,
    gradientDirection: GradientDirection = 'topToBottom',
    gradientLowIntensityFactor = 0.3
  ) {
    this.colorScale = colorScale;
    this.interpolation = interpolation;
    this.threshold = threshold;
    this.isGradientFillEnabled = isGradientFillEnabled;
    this.gradientDirection = gradientDirection;
    this.gradientLowIntensityFactor = gradientLowIntensityFactor;
  }

  /** Default configuration: workout scale, linear interpolation, no threshold. */
  static readonly default = new HeatmapConfiguration();

  equals(other: HeatmapConfiguration): boolean {
    return (
      this.colorScale.equals(other.colorScale) &&
      this.interpolation.equals(other.interpolation) &&
      this.threshold === other.threshold &&
      this.isGradientFillEnabled === other.isGradientFillEnabled &&
      this.gradientDirection === other.gradientDirection &&
      this.gradientLowIntensityFactor === other.gradientLowIntensityFactor
    );
  }
}
