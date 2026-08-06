/**
 * Configuration for the visual appearance of a BodyView.
 *
 * Direct port of `BodyViewStyle.swift`.
 */

import {
  MM_DEFAULT_FILL,
  MM_LIGHTER_FILL,
  MM_MEDIUM_FILL,
  fromWhite,
  rgb255,
  type ColorInput,
} from '../core/color';

export interface BodyViewStyleOptions {
  defaultFillColor?: ColorInput;
  strokeColor?: ColorInput;
  strokeWidth?: number;
  selectionColor?: ColorInput;
  selectionStrokeColor?: ColorInput;
  selectionStrokeWidth?: number;
  headColor?: ColorInput;
  hairColor?: ColorInput;
  shadowColor?: ColorInput;
  shadowRadius?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export class BodyViewStyle {
  defaultFillColor: ColorInput;
  strokeColor: ColorInput;
  strokeWidth: number;
  selectionColor: ColorInput;
  selectionStrokeColor: ColorInput;
  selectionStrokeWidth: number;
  headColor: ColorInput;
  hairColor: ColorInput;
  shadowColor: ColorInput;
  shadowRadius: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  constructor(options: BodyViewStyleOptions = {}) {
    this.defaultFillColor = options.defaultFillColor ?? MM_DEFAULT_FILL;
    this.strokeColor = options.strokeColor ?? 'transparent';
    this.strokeWidth = options.strokeWidth ?? 0;
    this.selectionColor = options.selectionColor ?? '#008000';
    this.selectionStrokeColor = options.selectionStrokeColor ?? '#008000';
    this.selectionStrokeWidth = options.selectionStrokeWidth ?? 2;
    this.headColor = options.headColor ?? fromWhite(0.75);
    this.hairColor = options.hairColor ?? fromWhite(0.25);
    this.shadowColor = options.shadowColor ?? 'transparent';
    this.shadowRadius = options.shadowRadius ?? 0;
    this.shadowOffsetX = options.shadowOffsetX ?? 0;
    this.shadowOffsetY = options.shadowOffsetY ?? 0;
  }

  /** A copy of this style with the given overrides. */
  copy(overrides: BodyViewStyleOptions = {}): BodyViewStyle {
    return new BodyViewStyle({
      defaultFillColor: overrides.defaultFillColor ?? this.defaultFillColor,
      strokeColor: overrides.strokeColor ?? this.strokeColor,
      strokeWidth: overrides.strokeWidth ?? this.strokeWidth,
      selectionColor: overrides.selectionColor ?? this.selectionColor,
      selectionStrokeColor: overrides.selectionStrokeColor ?? this.selectionStrokeColor,
      selectionStrokeWidth: overrides.selectionStrokeWidth ?? this.selectionStrokeWidth,
      headColor: overrides.headColor ?? this.headColor,
      hairColor: overrides.hairColor ?? this.hairColor,
      shadowColor: overrides.shadowColor ?? this.shadowColor,
      shadowRadius: overrides.shadowRadius ?? this.shadowRadius,
      shadowOffsetX: overrides.shadowOffsetX ?? this.shadowOffsetX,
      shadowOffsetY: overrides.shadowOffsetY ?? this.shadowOffsetY,
    });
  }

  /** Default style with gray fill and green selection. */
  static readonly default = new BodyViewStyle();

  /** Minimal style with thin strokes and subtle fill. */
  static readonly minimal = new BodyViewStyle({
    defaultFillColor: MM_LIGHTER_FILL,
    strokeColor: MM_MEDIUM_FILL,
    strokeWidth: 0.5,
    selectionStrokeWidth: 1.5,
  });

  /** Neon style with dark background tones and glow shadow. */
  static readonly neon = new BodyViewStyle({
    defaultFillColor: fromWhite(0.15),
    strokeColor: fromWhite(0.3),
    strokeWidth: 0.5,
    selectionColor: '#00ffff',
    selectionStrokeColor: '#00ffff',
    selectionStrokeWidth: 2,
    headColor: fromWhite(0.2),
    hairColor: fromWhite(0.1),
    shadowColor: 'rgba(0,255,255,0.6)',
    shadowRadius: 8,
  });

  /** Medical/clinical style. */
  static readonly medical = new BodyViewStyle({
    defaultFillColor: rgb255(230, 235, 242),
    strokeColor: rgb255(178, 191, 204),
    strokeWidth: 0.5,
    selectionColor: '#0000ff',
    selectionStrokeColor: '#0000ff',
    selectionStrokeWidth: 2,
    headColor: rgb255(217, 222, 230),
    hairColor: rgb255(77, 82, 89),
  });
}
