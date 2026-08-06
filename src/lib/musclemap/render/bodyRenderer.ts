/**
 * Renders the body map to SVG and performs hit testing.
 *
 * Web port of `BodyRenderer.swift` + `PathCache.swift`. Instead of manually
 * scaling paths into a `Path`, the renderer lets the browser scale the SVG via
 * a `viewBox`, which produces identical geometry.
 */

import type { BodyGender, BodySide, MuscleSide } from '../data/muscleSide';
import type { Muscle, BodySlug } from '../data/muscle';
import {
  bodySlugMuscle,
  isSubGroup,
  isAlwaysVisibleSubGroup,
  muscleParentGroup,
} from '../data/muscle';
import { pathsFor, viewBoxFor, type BodyPartPathData } from '../data/bodyPathData';
import type { MuscleHighlight } from '../heatmap/muscleIntensity';
import type { MuscleFill } from '../heatmap/muscleFill';
import { colorFill } from '../heatmap/muscleFill';
import { toCss } from '../core/color';
import type { BodyViewStyle } from '../view/bodyViewStyle';

const SVG_NS = 'http://www.w3.org/2000/svg';

let instanceCounter = 0;

/** All input needed to render the body. */
export interface RenderState {
  gender: BodyGender;
  side: BodySide;
  highlights: Partial<Record<Muscle, MuscleHighlight>>;
  style: BodyViewStyle;
  selected: ReadonlySet<Muscle>;
  selectionPulseFactor?: number;
  hideSubGroups?: boolean;
}

/** The result of a hit test at a point. */
export interface HitResult {
  muscle: Muscle;
  side: MuscleSide;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Unit-point and radius metrics for a gradient, in the muscle's rect space. */
interface GradientMetrics {
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  center?: { x: number; y: number };
  endRadiusPx?: number;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function slugMuscle(slug: BodySlug): Muscle | undefined {
  return bodySlugMuscle(slug);
}

function isSubGroupSlug(slug: BodySlug): boolean {
  const m = slugMuscle(slug);
  return m !== undefined && isSubGroup(m);
}

/** Resolves the fill for a body part (mirrors `BodyRenderer.resolveFill`). */
export function resolveFillFor(
  slug: BodySlug,
  highlight: MuscleHighlight | undefined,
  isSelected: boolean,
  style: BodyViewStyle,
  highlights: Partial<Record<Muscle, MuscleHighlight>>
): MuscleFill {
  if (slug === 'hair') return colorFill(style.hairColor);
  if (slug === 'head') return colorFill(style.headColor);
  if (isSelected) return colorFill(style.selectionColor);
  if (highlight) return highlight.fill;
  const muscle = slugMuscle(slug);
  if (muscle) {
    const parent = muscleParentGroup(muscle);
    if (parent) {
      const parentHighlight = highlights[parent];
      if (parentHighlight) return parentHighlight.fill;
    }
  }
  return colorFill(style.defaultFillColor);
}

/**
 * Builds the SVG element for the given render state. The element is not yet in
 * the document; call `finalizeGradients` after inserting it so gradients can be
 * laid out against the real path bounding boxes.
 */
export function buildBodySvg(state: RenderState): SVGSVGElement {
  const viewBox = viewBoxFor(state.gender, state.side);
  const style = state.style;
  const hideSubGroups = state.hideSubGroups ?? true;
  const pulseFactor = state.selectionPulseFactor ?? 1;
  const instanceId = ++instanceCounter;

  const svg = createSvgElement('svg', {
    class: 'mm-body-svg',
    xmlns: SVG_NS,
    viewBox: `${viewBox.originX} ${viewBox.originY} ${viewBox.width} ${viewBox.height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
  });
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.display = 'block';

  const defs = createSvgElement('defs');
  svg.appendChild(defs);

  const shadowFilterId = `mm-shadow-${instanceId}`;
  const hasShadow = style.shadowRadius > 0;
  if (hasShadow) {
    const filter = createSvgElement('filter', {
      id: shadowFilterId,
      x: '-40%',
      y: '-40%',
      width: '180%',
      height: '180%',
    });
    filter.appendChild(
      createSvgElement('feDropShadow', {
        dx: String(style.shadowOffsetX),
        dy: String(style.shadowOffsetY),
        stdDeviation: String(style.shadowRadius),
        'flood-color': toCss(style.shadowColor),
        'flood-opacity': '1',
      })
    );
    defs.appendChild(filter);
  }

  const bodyParts = pathsFor(state.gender, state.side);
  let gradientIndex = 0;

  for (const bodyPart of bodyParts) {
    const muscle = slugMuscle(bodyPart.slug);
    if (hideSubGroups && muscle && isSubGroup(muscle) && !isAlwaysVisibleSubGroup(muscle)) {
      continue;
    }

    const highlight = muscle ? state.highlights[muscle] : undefined;

    const isSelected: boolean = (() => {
      if (!muscle) return false;
      if (state.selected.has(muscle)) return true;
      if (hideSubGroups && isAlwaysVisibleSubGroup(muscle)) {
        const parent = muscleParentGroup(muscle);
        if (parent) return state.selected.has(parent);
      }
      return false;
    })();

    const fill = resolveFillFor(
      bodyPart.slug,
      highlight,
      isSelected,
      style,
      state.highlights
    );

    const highlightOpacity = highlight ? highlight.opacity : 1;
    let opacity = highlight ? highlightOpacity : 1;
    if (isSelected && pulseFactor !== 1) {
      opacity *= pulseFactor;
    }
    const needsShadow = hasShadow && highlight !== undefined;

    const allPaths: Array<{ d: string; side: MuscleSide }> = [
      ...(bodyPart.common ?? []).map((d) => ({ d, side: 'both' as MuscleSide })),
      ...(bodyPart.left ?? []).map((d) => ({ d, side: 'left' as MuscleSide })),
      ...(bodyPart.right ?? []).map((d) => ({ d, side: 'right' as MuscleSide })),
    ];

    for (const { d, side } of allPaths) {
      const path = createSvgElement('path', {
        d,
        class: 'mm-path',
        'data-slug': bodyPart.slug,
        'data-side': side,
      });

      if (muscle) {
        path.setAttribute('data-muscle', muscle);
        if (isSelected) path.setAttribute('data-selected', 'true');
      }

      if (fill.kind === 'linearGradient' || fill.kind === 'radialGradient') {
        const gradId = `mm-gradient-${instanceId}-${gradientIndex++}`;
        const gradientEl = makeGradientElement(gradId, fill);
        defs.appendChild(gradientEl);
        storeGradientMetrics(path, fill);
        path.setAttribute('data-gradient', gradId);
        path.setAttribute('fill', `url(#${gradId})`);
      } else {
        path.setAttribute('fill', toCss(fill.color));
      }

      const opacityAttr = Math.round(opacity * 10000) / 10000;
      if (opacityAttr !== 1) {
        path.setAttribute('opacity', String(opacityAttr));
      }
      if (muscle) {
        path.setAttribute('data-base-opacity', String(opacityAttr));
      }

      if (style.strokeWidth > 0) {
        path.setAttribute('stroke', toCss(style.strokeColor));
        path.setAttribute('stroke-width', String(style.strokeWidth));
      }

      if (isSelected) {
        // Draw the selection stroke on a duplicate path, mirroring the Swift
        // renderer which strokes the selection outline after the normal stroke.
        const selected = createSvgElement('path', {
          d,
          class: 'mm-selection-stroke',
          'data-overlay': 'selection',
          fill: 'none',
          stroke: toCss(style.selectionStrokeColor),
          'stroke-width': String(style.selectionStrokeWidth),
        });
        svg.appendChild(selected);
      }

      if (needsShadow) {
        path.setAttribute('filter', `url(#${shadowFilterId})`);
      }

      svg.appendChild(path);
    }
  }

  return svg;
}

function makeGradientElement(
  id: string,
  fill: Extract<MuscleFill, { kind: 'linearGradient' } | { kind: 'radialGradient' }>
): SVGGradientElement {
  const stops = fill.colors.map((color, i) =>
    createSvgElement('stop', {
      'stop-color': toCss(color),
      offset: fill.colors.length > 1 ? String(i / (fill.colors.length - 1)) : '0',
    })
  );

  if (fill.kind === 'linearGradient') {
    const g = createSvgElement('linearGradient', {
      id,
      gradientUnits: 'userSpaceOnUse',
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '0',
    });
    for (const stop of stops) g.appendChild(stop);
    return g as SVGGradientElement;
  }

  const g = createSvgElement('radialGradient', {
    id,
    gradientUnits: 'userSpaceOnUse',
    cx: '0',
    cy: '0',
    fx: '0',
    fy: '0',
    r: '0',
  });
  for (const stop of stops) g.appendChild(stop);
  return g as SVGGradientElement;
}

interface MetricsStore {
  _mmGradient?: GradientMetrics;
}

/** Stores gradient metrics on the path element for layout during finalize. */
function storeGradientMetrics(
  path: SVGPathElement,
  fill: Extract<MuscleFill, { kind: 'linearGradient' } | { kind: 'radialGradient' }>
): void {
  const store = path as unknown as MetricsStore;
  if (fill.kind === 'linearGradient') {
    store._mmGradient = {
      startPoint: fill.startPoint,
      endPoint: fill.endPoint,
    };
  } else {
    store._mmGradient = {
      center: fill.center,
      endRadiusPx: fill.endRadius,
    };
  }
}

/**
 * Lays out gradient defs against the real bounding boxes of the paths that
 * reference them. Must be called after the SVG is attached to the document.
 */
export function finalizeGradients(svg: SVGSVGElement): void {
  const gradientPaths = svg.querySelectorAll<SVGPathElement>('path[data-gradient]');
  for (const path of Array.from(gradientPaths)) {
    const id = path.getAttribute('data-gradient');
    if (!id) continue;
    const gradient = svg.querySelector(`#${id}`) as SVGGradientElement | null;
    if (!gradient) continue;
    const metrics = (path as unknown as MetricsStore)._mmGradient;
    if (!metrics) continue;
    const bbox = path.getBBox();
    if (bbox.width === 0 && bbox.height === 0) continue;

    if (gradient.tagName === 'linearGradient' && metrics.startPoint && metrics.endPoint) {
      const x1 = bbox.x + bbox.width * metrics.startPoint.x;
      const y1 = bbox.y + bbox.height * metrics.startPoint.y;
      const x2 = bbox.x + bbox.width * metrics.endPoint.x;
      const y2 = bbox.y + bbox.height * metrics.endPoint.y;
      gradient.setAttribute('x1', String(x1));
      gradient.setAttribute('y1', String(y1));
      gradient.setAttribute('x2', String(x2));
      gradient.setAttribute('y2', String(y2));
    } else if (gradient.tagName === 'radialGradient' && metrics.center) {
      const cx = bbox.x + bbox.width * metrics.center.x;
      const cy = bbox.y + bbox.height * metrics.center.y;
      gradient.setAttribute('cx', String(cx));
      gradient.setAttribute('cy', String(cy));
      gradient.setAttribute('fx', String(cx));
      gradient.setAttribute('fy', String(cy));
      // Swift measures radii in scaled (screen) units; convert to user units.
      const scale = effectiveScale(svg);
      const radiusPx = metrics.endRadiusPx ?? 0;
      gradient.setAttribute('r', String(scale > 0 ? radiusPx / scale : 0));
    }
  }
}

function effectiveScale(svg: SVGSVGElement): number {
  const ctm = svg.getScreenCTM?.();
  if (ctm) return Math.abs(ctm.a) || 1;
  const viewBox = svg.viewBox.baseVal;
  const w = svg.clientWidth || viewBox.width;
  const h = svg.clientHeight || viewBox.height;
  if (viewBox.width <= 0 || viewBox.height <= 0) return 1;
  return Math.min(w / viewBox.width, h / viewBox.height);
}

/**
 * Converts a client/viewport point into SVG user coordinates. Uses the
 * element's bounding rect (which accounts for CSS transforms such as zoom), so
 * hit testing stays correct when the body is scaled or panned by CSS.
 */
export function clientToSvgUser(
  svg: SVGSVGElement,
  clientPoint: { x: number; y: number }
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
  const offsetX = rect.left + (rect.width - viewBox.width * scale) / 2;
  const offsetY = rect.top + (rect.height - viewBox.height * scale) / 2;
  return {
    x: (clientPoint.x - offsetX) / scale + viewBox.x,
    y: (clientPoint.y - offsetY) / scale + viewBox.y,
  };
}

/**
 * Converts SVG user coordinates into viewport coordinates (relative to the
 * untransformed viewport box of the SVG).
 */
export function svgUserToViewport(
  svg: SVGSVGElement,
  userPoint: { x: number; y: number }
): { x: number; y: number } {
  const viewBox = svg.viewBox.baseVal;
  const width = svg.clientWidth || viewBox.width;
  const height = svg.clientHeight || viewBox.height;
  const scale = Math.min(width / viewBox.width, height / viewBox.height);
  const offsetX = (width - viewBox.width * scale) / 2;
  const offsetY = (height - viewBox.height * scale) / 2;
  return {
    x: (userPoint.x - viewBox.x) * scale + offsetX,
    y: (userPoint.y - viewBox.y) * scale + offsetY,
  };
}

/**
 * Finds which muscle (if any) was hit at the given point. The point must be in
 * screen/client coordinates; it is transformed into SVG user space internally.
 * Sub-groups are tested before their parent groups.
 */
export function hitTestAt(
  svg: SVGSVGElement,
  state: Pick<RenderState, 'gender' | 'side' | 'hideSubGroups'>,
  clientPoint: { x: number; y: number }
): HitResult | null {
  const hideSubGroups = state.hideSubGroups ?? true;
  const point = clientToSvgUser(svg, clientPoint);
  const userPoint = new DOMPoint(point.x, point.y);

  const bodyParts = pathsFor(state.gender, state.side);
  const sortedParts = bodyParts.slice().sort((a, b) => {
    const aSub = isSubGroupSlug(a.slug);
    const bSub = isSubGroupSlug(b.slug);
    if (aSub !== bSub) return aSub ? -1 : 1;
    return 0;
  });

  for (const bodyPart of sortedParts) {
    const muscle = slugMuscle(bodyPart.slug);
    if (!muscle) continue;
    if (hideSubGroups && isSubGroup(muscle) && !isAlwaysVisibleSubGroup(muscle)) {
      continue;
    }

    // Always-visible sub-groups return their parent when sub-groups are hidden.
    const resolvedMuscle: Muscle =
      hideSubGroups && isAlwaysVisibleSubGroup(muscle)
        ? (muscleParentGroup(muscle) ?? muscle)
        : muscle;

    if (hitPaths(svg, bodyPart, 'left', userPoint)) {
      return { muscle: resolvedMuscle, side: 'left' };
    }
    if (hitPaths(svg, bodyPart, 'right', userPoint)) {
      return { muscle: resolvedMuscle, side: 'right' };
    }
    if (hitPaths(svg, bodyPart, 'both', userPoint)) {
      return { muscle: resolvedMuscle, side: 'both' };
    }
  }

  return null;
}

function hitPaths(
  svg: SVGSVGElement,
  bodyPart: BodyPartPathData,
  side: MuscleSide,
  point: DOMPoint
): boolean {
  const paths = svg.querySelectorAll<SVGPathElement>(
    `path[data-slug="${bodyPart.slug}"][data-side="${side}"]`
  );
  for (const path of Array.from(paths)) {
    if (path.getAttribute('data-muscle') !== null && path.isPointInFill(point)) {
      return true;
    }
  }
  return false;
}

/** Returns the union bounding rect (in SVG user units) for a muscle. */
export function boundingRectFor(
  svg: SVGSVGElement,
  muscle: Muscle
): Rect | null {
  const paths = svg.querySelectorAll<SVGPathElement>(`path[data-muscle="${muscle}"]`);
  let union: Rect | null = null;
  for (const path of Array.from(paths)) {
    const bbox = path.getBBox();
    if (bbox.width === 0 && bbox.height === 0) continue;
    const rect = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    union = union ? unionRects(union, rect) : rect;
  }
  return union;
}

function unionRects(a: Rect, b: Rect): Rect {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Returns all muscles currently visible for a given state (for accessibility). */
export function visibleMuscles(
  state: Pick<RenderState, 'gender' | 'side' | 'hideSubGroups'>
): Muscle[] {
  const hideSubGroups = state.hideSubGroups ?? true;
  const seen = new Set<Muscle>();
  const result: Muscle[] = [];
  for (const bodyPart of pathsFor(state.gender, state.side)) {
    const muscle = slugMuscle(bodyPart.slug);
    if (!muscle || muscle === 'head') continue;
    if (seen.has(muscle)) continue;
    if (hideSubGroups && isSubGroup(muscle) && !isAlwaysVisibleSubGroup(muscle)) {
      continue;
    }
    seen.add(muscle);
    result.push(muscle);
  }
  return result;
}
