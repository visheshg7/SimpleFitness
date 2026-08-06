/**
 * MuscleMap — interactive human body muscle maps for the web.
 *
 * A TypeScript port of the MuscleMap SwiftUI SDK. Framework-agnostic; renders
 * to SVG and works with any front-end stack.
 */

// Core
export * from './core/color';
export { parseSvgPath } from './core/svgPathParser';
export type { SVGPathCommand } from './core/svgPathParser';
export { buildSvgPathD, svgCommandsFor } from './core/pathBuilder';

// Data
export {
  MUSCLE,
  ALL_MUSCLES,
  isMuscle,
  bodySlugMuscle,
  isCosmeticPart,
  muscleSubGroups,
  muscleParentGroup,
  isSubGroup,
  isAlwaysVisibleSubGroup,
  muscleLocalizationKey,
  isVisibleSlug,
} from './data/muscle';
export type { Muscle, BodySlug } from './data/muscle';
export {
  MUSCLE_SIDES,
  BODY_SIDES,
  BODY_GENDERS,
} from './data/muscleSide';
export type { MuscleSide, BodySide, BodyGender } from './data/muscleSide';
export { MuscleSelection } from './data/muscleSelection';
export {
  allPathsOf,
  pathsFor,
  viewBoxFor,
  computeLayout,
  VIEW_BOXES,
  UNIT_TOP,
  UNIT_BOTTOM,
  UNIT_LEADING,
  UNIT_TRAILING,
  UNIT_CENTER,
} from './data/bodyPathData';
export type { BodyPartPathData, BodyViewBox, UnitPoint } from './data/bodyPathData';
export * from './data/paths/index';

// Heatmap
export { ColorInterpolation } from './heatmap/colorInterpolation';
export { HeatmapColorScale } from './heatmap/heatmapColorScale';
export {
  HeatmapConfiguration,
  gradientStartPoint,
  gradientEndPoint,
} from './heatmap/heatmapConfiguration';
export type { GradientDirection } from './heatmap/heatmapConfiguration';
export {
  colorFill,
  linearGradientFill,
  radialGradientFill,
  fillFirstColor,
  sameFillKind,
} from './heatmap/muscleFill';
export type { MuscleFill } from './heatmap/muscleFill';
export { MuscleIntensity, MuscleHighlight } from './heatmap/muscleIntensity';

// Rendering
export {
  buildBodySvg,
  finalizeGradients,
  hitTestAt,
  boundingRectFor,
  clientToSvgUser,
  svgUserToViewport,
  resolveFillFor,
  visibleMuscles,
} from './render/bodyRenderer';
export type { RenderState, HitResult } from './render/bodyRenderer';

// Views
export { BodyView } from './view/bodyView';
export type {
  BodyViewOptions,
  TooltipRenderer,
} from './view/bodyView';
export { BodyViewStyle } from './view/bodyViewStyle';
export type { BodyViewStyleOptions } from './view/bodyViewStyle';
export { SelectionHistory } from './view/selectionHistory';
export { HeatmapLegend } from './view/heatmapLegend';
export type { HeatmapLegendOptions } from './view/heatmapLegend';
export {
  translate,
  muscleDisplayName,
  sideDisplayName,
  bodySideDisplayName,
  genderDisplayName,
  currentLocale,
  normalizeLocale,
  LOCALES,
} from './view/localization';
export type { Locale } from './view/localization';
