/**
 * Color interpolation curves for heatmap mapping.
 *
 * Direct port of `ColorInterpolation.swift`.
 */

export type InterpolationCurve = (t: number) => number;

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/**
 * Defines how color values are interpolated across a heatmap color scale.
 */
export class ColorInterpolation {
  /** Linear interpolation (default behavior). */
  static readonly linear = new ColorInterpolation('linear', (t) => clamp01(t));

  /** Slow start, fast end (ease-in curve). */
  static readonly easeIn = new ColorInterpolation('easeIn', (t) => {
    const c = clamp01(t);
    return c * c;
  });

  /** Fast start, slow end (ease-out curve). */
  static readonly easeOut = new ColorInterpolation('easeOut', (t) => {
    const c = clamp01(t);
    return 1 - (1 - c) * (1 - c);
  });

  /** Slow start and end (ease-in-out curve). */
  static readonly easeInOut = new ColorInterpolation('easeInOut', (t) => {
    const c = clamp01(t);
    if (c < 0.5) return 2 * c * c;
    return 1 - Math.pow(-2 * c + 2, 2) / 2;
  });

  /** Stepped interpolation with discrete levels. */
  static step(count: number): ColorInterpolation {
    const c = Math.max(Math.floor(count), 0);
    return new ColorInterpolation('step', (t) => {
      if (c <= 0) return clamp01(t);
      const stepped = Math.floor(clamp01(t) * c) / c;
      return Math.min(stepped, 1);
    });
  }

  /** Custom interpolation curve. */
  static custom(curve: InterpolationCurve): ColorInterpolation {
    return new ColorInterpolation('custom', (t) => clamp01(curve(clamp01(t))));
  }

  private constructor(
    private readonly kind: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step' | 'custom',
    private readonly fn: InterpolationCurve
  ) {
    this.kind = kind;
    this.fn = fn;
  }

  /** Applies the interpolation curve to a fraction value (0.0 – 1.0). */
  apply(t: number): number {
    return this.fn(t);
  }

  /** Whether two interpolations are equivalent (custom curves are never equal). */
  equals(other: ColorInterpolation): boolean {
    return this.kind === other.kind;
  }
}
