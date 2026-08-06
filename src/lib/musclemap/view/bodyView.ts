/**
 * The main interactive body map view.
 *
 * Web port of `BodyView.swift` (plus the overlay/animation/zoom containers it
 * composes). It is an imperative, framework-agnostic class that renders an SVG
 * body into a container and wires up gestures, zoom, tooltips, animations and
 * accessibility.
 */

import type { BodyGender, BodySide, MuscleSide } from '../data/muscleSide';
import type { Muscle } from '../data/muscle';
import {
  muscleDisplayName,
  translate,
  type Locale,
} from './localization';
import { BodyViewStyle } from './bodyViewStyle';
import { SelectionHistory } from './selectionHistory';
import {
  buildBodySvg,
  finalizeGradients,
  hitTestAt,
  boundingRectFor,
  svgUserToViewport,
  type RenderState,
  type HitResult,
} from '../render/bodyRenderer';
import type { MuscleHighlight, MuscleIntensity } from '../heatmap/muscleIntensity';
import { MuscleHighlight as Highlight } from '../heatmap/muscleIntensity';
import { HeatmapColorScale } from '../heatmap/heatmapColorScale';
import { ColorInterpolation } from '../heatmap/colorInterpolation';
import { HeatmapConfiguration, gradientStartPoint, gradientEndPoint } from '../heatmap/heatmapConfiguration';
import { interpolateColor, type ColorInput } from '../core/color';
import type { UnitPoint } from '../data/bodyPathData';

export type TooltipRenderer = (muscle: Muscle, side: MuscleSide) => string | HTMLElement;

export interface BodyViewOptions {
  gender?: BodyGender;
  side?: BodySide;
  style?: BodyViewStyle;
  highlights?: Partial<Record<Muscle, MuscleHighlight>>;
  selected?: ReadonlySet<Muscle> | Muscle | Muscle[] | null;
  hideSubGroups?: boolean;
  onMuscleSelected?: (muscle: Muscle, side: MuscleSide) => void;
  onMuscleLongPressed?: (muscle: Muscle, side: MuscleSide) => void;
  longPressDuration?: number;
  onMuscleDragged?: (muscle: Muscle, side: MuscleSide) => void;
  onMuscleDragEnded?: () => void;
  zoomable?: boolean;
  minZoomScale?: number;
  maxZoomScale?: number;
  tooltip?: TooltipRenderer;
  animated?: boolean;
  animationDuration?: number;
  pulseSelected?: boolean;
  pulseSpeed?: number;
  pulseRange?: [number, number];
  history?: SelectionHistory;
  locale?: Locale;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

interface PointerInfo {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
}

export class BodyView {
  // Configuration
  private gender: BodyGender;
  private side: BodySide;
  private style: BodyViewStyle;
  private highlights: Partial<Record<Muscle, MuscleHighlight>> = {};
  private selectedSet: Set<Muscle> = new Set();
  private hideSubGroups: boolean;
  private locale: Locale;

  private selectedCallback: ((muscle: Muscle, side: MuscleSide) => void) | null;
  private longPressedCallback: ((muscle: Muscle, side: MuscleSide) => void) | null;
  private draggedCallback: ((muscle: Muscle, side: MuscleSide) => void) | null;
  private dragEndedCallback: (() => void) | null;
  private longPressDuration: number;

  private isZoomEnabled: boolean;
  private minZoomScale: number;
  private maxZoomScale: number;

  private tooltipRenderer: TooltipRenderer | null;

  private isAnimated: boolean;
  private animationDuration: number;

  private isPulseEnabled: boolean;
  private pulseSpeed: number;
  private pulseRange: [number, number];

  private heatmapConfig: HeatmapConfiguration;
  private selectionHistory: SelectionHistory | null;

  // DOM
  private container: HTMLElement | null = null;
  private rootEl: HTMLDivElement | null = null;
  private zoomEl: HTMLDivElement | null = null;
  private viewportEl: HTMLDivElement | null = null;
  private tooltipLayerEl: HTMLDivElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Zoom state
  private zoomScale = 1;
  private zoomOffset = { x: 0, y: 0 };

  // Gesture state
  private pointers = new Map<number, PointerInfo>();
  private pinchStartDistance = 0;
  private pinchStartScale = 1;
  private panStartOffset = { x: 0, y: 0 };
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressFired = false;
  private dragStarted = false;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private pendingTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDragMove: { x: number; y: number } | null = null;
  private dragFrame = 0;

  // Animation state
  private transitionFrame = 0;
  private pulseFrame = 0;
  private lastRenderedHighlights: Partial<Record<Muscle, MuscleHighlight>> = {};

  constructor(options: BodyViewOptions = {}) {
    this.gender = options.gender ?? 'male';
    this.side = options.side ?? 'front';
    this.style = options.style ?? BodyViewStyle.default;
    this.hideSubGroups = options.hideSubGroups ?? true;
    this.locale = options.locale ?? 'en';

    if (options.highlights) this.highlights = { ...options.highlights };
    if (options.selected != null) this.setSelected(options.selected);

    this.selectedCallback = options.onMuscleSelected ?? null;
    this.longPressedCallback = options.onMuscleLongPressed ?? null;
    this.draggedCallback = options.onMuscleDragged ?? null;
    this.dragEndedCallback = options.onMuscleDragEnded ?? null;
    this.longPressDuration = options.longPressDuration ?? 0.5;

    this.isZoomEnabled = options.zoomable ?? false;
    this.minZoomScale = options.minZoomScale ?? 1;
    this.maxZoomScale = options.maxZoomScale ?? 4;

    this.tooltipRenderer = options.tooltip ?? null;

    this.isAnimated = options.animated ?? false;
    this.animationDuration = options.animationDuration ?? 0.3;

    this.isPulseEnabled = options.pulseSelected ?? false;
    this.pulseSpeed = options.pulseSpeed ?? 1.5;
    this.pulseRange = options.pulseRange ?? [0.6, 1.0];

    this.heatmapConfig = HeatmapConfiguration.default;
    this.selectionHistory = options.history ?? null;
  }

  // MARK: - Mounting

  /** Mounts the view into a container (selector or element). */
  mount(target: string | HTMLElement): this {
    const container =
      typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
    if (!container) {
      throw new Error(`MuscleMap: mount target not found: ${target}`);
    }
    this.unmount();

    this.container = container;

    const root = document.createElement('div');
    root.className = 'mm-root';
    root.style.position = 'relative';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.overflow = 'hidden';
    root.style.touchAction = 'none';
    root.style.userSelect = 'none';
    root.style.webkitUserSelect = 'none';

    const zoom = document.createElement('div');
    zoom.className = 'mm-zoom';
    zoom.style.width = '100%';
    zoom.style.height = '100%';
    zoom.style.transformOrigin = '0 0';
    zoom.style.willChange = 'transform';

    const viewport = document.createElement('div');
    viewport.className = 'mm-viewport';
    viewport.style.position = 'relative';
    viewport.style.width = '100%';
    viewport.style.height = '100%';
    viewport.style.overflow = 'hidden';

    const tooltipLayer = document.createElement('div');
    tooltipLayer.className = 'mm-tooltip-layer';
    tooltipLayer.style.position = 'absolute';
    tooltipLayer.style.inset = '0';
    tooltipLayer.style.pointerEvents = 'none';
    tooltipLayer.style.overflow = 'visible';

    container.appendChild(root);
    root.appendChild(zoom);
    zoom.appendChild(viewport);
    viewport.appendChild(tooltipLayer);

    this.rootEl = root;
    this.zoomEl = zoom;
    this.viewportEl = viewport;
    this.tooltipLayerEl = tooltipLayer;

    this.renderBody();
    this.applyZoom();

    viewport.addEventListener('pointerdown', this.onPointerDown);
    viewport.addEventListener('pointermove', this.onPointerMove);
    viewport.addEventListener('pointerup', this.onPointerUp);
    viewport.addEventListener('pointercancel', this.onPointerCancel);
    viewport.addEventListener('pointerleave', this.onPointerCancel);

    this.resizeObserver = new ResizeObserver(() => {
      if (this.svgEl) finalizeGradients(this.svgEl);
      this.updateTooltips();
    });
    this.resizeObserver.observe(viewport);

    if (this.isPulseEnabled) this.startPulse();

    return this;
  }

  /** Removes the view from the DOM and cancels all timers/loops. */
  unmount(): void {
    this.cancelAnimationLoops();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.rootEl && this.container && this.rootEl.parentElement === this.container) {
      this.container.removeChild(this.rootEl);
    }
    this.container = null;
    this.rootEl = null;
    this.zoomEl = null;
    this.viewportEl = null;
    this.tooltipLayerEl = null;
    this.svgEl = null;
    this.pointers.clear();
  }

  destroy(): void {
    this.unmount();
  }

  // MARK: - Configuration setters

  setGender(gender: BodyGender): this {
    if (this.gender !== gender) {
      this.gender = gender;
      this.renderBody();
    }
    return this;
  }

  setSide(side: BodySide): this {
    if (this.side !== side) {
      this.side = side;
      this.renderBody();
    }
    return this;
  }

  setStyle(style: BodyViewStyle): this {
    this.style = style;
    this.renderBody();
    return this;
  }

  setLocale(locale: Locale): this {
    this.locale = locale;
    this.renderBody();
    return this;
  }

  showSubGroups(): this {
    this.hideSubGroups = false;
    this.renderBody();
    return this;
  }

  setHideSubGroups(hidden: boolean): this {
    this.hideSubGroups = hidden;
    this.renderBody();
    return this;
  }

  // MARK: - Highlights

  /** Highlights a muscle with a color. */
  highlight(muscle: Muscle, color: ColorInput, opacity = 1): this {
    this.highlights[muscle] = new Highlight(muscle, color, opacity);
    this.commitHighlights();
    return this;
  }

  /** Highlights multiple muscles with the same color. */
  highlightAll(muscles: Muscle[], color: ColorInput, opacity = 1): this {
    for (const muscle of muscles) {
      this.highlights[muscle] = new Highlight(muscle, color, opacity);
    }
    this.commitHighlights();
    return this;
  }

  /** Highlights a muscle with a linear gradient. */
  highlightLinear(
    muscle: Muscle,
    colors: ColorInput[],
    startPoint: UnitPoint = { x: 0.5, y: 0 },
    endPoint: UnitPoint = { x: 0.5, y: 1 },
    opacity = 1
  ): this {
    this.highlights[muscle] = Highlight.withFill(
      muscle,
      { kind: 'linearGradient', colors, startPoint, endPoint },
      opacity
    );
    this.commitHighlights();
    return this;
  }

  /** Highlights a muscle with a radial gradient. */
  highlightRadial(
    muscle: Muscle,
    colors: ColorInput[],
    center: UnitPoint = { x: 0.5, y: 0.5 },
    startRadius = 0,
    endRadius = 40,
    opacity = 1
  ): this {
    this.highlights[muscle] = Highlight.withFill(
      muscle,
      { kind: 'radialGradient', colors, center, startRadius, endRadius },
      opacity
    );
    this.commitHighlights();
    return this;
  }

  setHighlights(highlights: Partial<Record<Muscle, MuscleHighlight>>): this {
    this.highlights = { ...highlights };
    this.commitHighlights();
    return this;
  }

  clearHighlights(): this {
    this.highlights = {};
    this.commitHighlights();
    return this;
  }

  getHighlights(): Partial<Record<Muscle, MuscleHighlight>> {
    return { ...this.highlights };
  }

  private commitHighlights(): void {
    this.renderOrAnimate();
  }

  // MARK: - Heatmap

  /** Applies intensity-based highlighting (0–4 scale, like workout trackers). */
  setIntensities(data: Partial<Record<Muscle, number>>, colorScale = HeatmapColorScale.workout): this {
    const highlights: Partial<Record<Muscle, MuscleHighlight>> = {};
    for (const [muscle, level] of Object.entries(data)) {
      const normalized = clamp(Number(level), 0, 4) / 4;
      highlights[muscle as Muscle] = new Highlight(muscle as Muscle, colorScale.colorFor(normalized), 1);
    }
    this.highlights = highlights;
    this.commitHighlights();
    return this;
  }

  /**
   * Applies heatmap data using a color scale (or stored configuration).
   * Pass a `config` to also set the full heatmap configuration (equivalent to
   * the Swift `.heatmap(data, configuration:)` modifier).
   */
  setHeatmap(
    data: MuscleIntensity[],
    colorScale: HeatmapColorScale = HeatmapColorScale.workout,
    config?: HeatmapConfiguration
  ): this {
    if (config) this.heatmapConfig = config;
    const cfg = this.heatmapConfig;
    // When a full configuration is supplied, its color scale takes precedence
    // (mirrors the Swift `.heatmap(data, configuration:)` behavior).
    const sourceScale = config ? config.colorScale : colorScale;
    const effectiveScale = new HeatmapColorScale(sourceScale.colors, cfg.interpolation);
    const highlights: Partial<Record<Muscle, MuscleHighlight>> = {};

    for (const entry of data) {
      if (cfg.threshold != null && entry.intensity < cfg.threshold) continue;

      let highlight: MuscleHighlight;
      if (entry.color != null) {
        highlight = new Highlight(entry.muscle, entry.color, 1);
      } else if (cfg.isGradientFillEnabled) {
        const highColor = effectiveScale.colorFor(entry.intensity);
        const lowColor = effectiveScale.colorFor(entry.intensity * cfg.gradientLowIntensityFactor);
        highlight = Highlight.withFill(
          entry.muscle,
          {
            kind: 'linearGradient',
            colors: [lowColor, highColor],
            startPoint: gradientStartPoint(cfg.gradientDirection),
            endPoint: gradientEndPoint(cfg.gradientDirection),
          },
          1
        );
      } else {
        highlight = new Highlight(entry.muscle, effectiveScale.colorFor(entry.intensity), 1);
      }
      highlights[entry.muscle] = highlight;
    }

    this.highlights = highlights;
    this.commitHighlights();
    return this;
  }

  /** Sets the heatmap interpolation curve for subsequent `setHeatmap` calls. */
  setHeatmapInterpolation(interpolation: ColorInterpolation): this {
    this.heatmapConfig = new HeatmapConfiguration(
      this.heatmapConfig.colorScale,
      interpolation,
      this.heatmapConfig.threshold,
      this.heatmapConfig.isGradientFillEnabled,
      this.heatmapConfig.gradientDirection,
      this.heatmapConfig.gradientLowIntensityFactor
    );
    return this;
  }

  /** Sets the minimum intensity threshold for heatmap display. */
  setHeatmapThreshold(threshold: number | null): this {
    this.heatmapConfig = new HeatmapConfiguration(
      this.heatmapConfig.colorScale,
      this.heatmapConfig.interpolation,
      threshold,
      this.heatmapConfig.isGradientFillEnabled,
      this.heatmapConfig.gradientDirection,
      this.heatmapConfig.gradientLowIntensityFactor
    );
    return this;
  }

  /** Enables intra-muscle gradient fill for heatmap. */
  setHeatmapGradient(direction: 'topToBottom' | 'bottomToTop' | 'leftToRight' | 'rightToLeft' = 'topToBottom', lowFactor = 0.3): this {
    this.heatmapConfig = new HeatmapConfiguration(
      this.heatmapConfig.colorScale,
      this.heatmapConfig.interpolation,
      this.heatmapConfig.threshold,
      true,
      direction,
      lowFactor
    );
    return this;
  }

  // MARK: - Selection

  setSelected(selection: ReadonlySet<Muscle> | Muscle | Muscle[] | null): this {
    if (selection == null) {
      this.selectedSet = new Set();
    } else if (selection instanceof Set) {
      this.selectedSet = new Set<Muscle>(selection as Iterable<Muscle>);
    } else if (Array.isArray(selection)) {
      this.selectedSet = new Set(selection);
    } else {
      this.selectedSet = new Set([selection as Muscle]);
    }
    this.renderBody();
    this.updateTooltips();
    return this;
  }

  getSelected(): Set<Muscle> {
    return new Set(this.selectedSet);
  }

  /** Toggles a muscle in the current selection. */
  toggleSelected(muscle: Muscle): this {
    const next = new Set(this.selectedSet);
    if (next.has(muscle)) next.delete(muscle);
    else next.add(muscle);
    return this.setSelected(next);
  }

  // MARK: - Callbacks

  onMuscleSelected(callback: ((muscle: Muscle, side: MuscleSide) => void) | null): this {
    this.selectedCallback = callback;
    return this;
  }

  onMuscleLongPressed(callback: ((muscle: Muscle, side: MuscleSide) => void) | null, duration = 0.5): this {
    this.longPressedCallback = callback;
    this.longPressDuration = duration;
    return this;
  }

  onMuscleDragged(callback: ((muscle: Muscle, side: MuscleSide) => void) | null, onEnded?: () => void): this {
    this.draggedCallback = callback;
    if (onEnded !== undefined) this.dragEndedCallback = onEnded;
    return this;
  }

  // MARK: - Zoom

  setZoomable(enabled: boolean, minScale = 1, maxScale = 4): this {
    this.isZoomEnabled = enabled;
    this.minZoomScale = minScale;
    this.maxZoomScale = maxScale;
    if (!enabled) {
      this.zoomScale = 1;
      this.zoomOffset = { x: 0, y: 0 };
    }
    this.applyZoom();
    return this;
  }

  resetZoom(): this {
    this.zoomScale = 1;
    this.zoomOffset = { x: 0, y: 0 };
    this.applyZoom();
    return this;
  }

  getZoomScale(): number {
    return this.zoomScale;
  }

  // MARK: - Animation

  setAnimated(enabled: boolean, duration = 0.3): this {
    this.isAnimated = enabled;
    this.animationDuration = duration;
    return this;
  }

  setPulseSelected(enabled: boolean, speed = 1.5, range: [number, number] = [0.6, 1.0]): this {
    this.isPulseEnabled = enabled;
    this.pulseSpeed = speed;
    this.pulseRange = range;
    if (enabled) {
      this.startPulse();
    } else {
      this.stopPulse();
      if (this.svgEl) this.clearPulseOpacity();
    }
    return this;
  }

  // MARK: - Tooltip & history

  setTooltip(renderer: TooltipRenderer | null): this {
    this.tooltipRenderer = renderer;
    this.updateTooltips();
    return this;
  }

  undoable(history: SelectionHistory | null): this {
    this.selectionHistory = history;
    return this;
  }

  /** The undo/redo selection history, if one was attached via `undoable()`. */
  get history(): SelectionHistory | null {
    return this.selectionHistory;
  }

  /** Pushes the current selection into the attached history (no-op if none). */
  pushToHistory(selection?: ReadonlySet<Muscle>): void {
    this.selectionHistory?.push(new Set(selection ?? this.selectedSet));
  }

  // MARK: - Introspection

  getSvg(): SVGSVGElement | null {
    return this.svgEl;
  }

  /** Returns the muscle at a client point, or null. */
  hitTest(clientPoint: { x: number; y: number }): HitResult | null {
    if (!this.svgEl) return null;
    return hitTestAt(this.svgEl, {
      gender: this.gender,
      side: this.side,
      hideSubGroups: this.hideSubGroups,
    }, clientPoint);
  }

  /** Returns the union bounding rect (user units) for a muscle, or null. */
  getMuscleRect(muscle: Muscle): { x: number; y: number; width: number; height: number } | null {
    if (!this.svgEl) return null;
    return boundingRectFor(this.svgEl, muscle);
  }

  // MARK: - Rendering

  private makeRenderState(
    highlights: Partial<Record<Muscle, MuscleHighlight>>
  ): RenderState {
    return {
      gender: this.gender,
      side: this.side,
      highlights,
      style: this.style,
      selected: this.selectedSet,
      selectionPulseFactor: 1,
      hideSubGroups: this.hideSubGroups,
    };
  }

  private renderBody(): void {
    if (!this.viewportEl) return;
    this.cancelTransition();
    this.lastRenderedHighlights = { ...this.highlights };
    this.buildSvgIntoViewport(this.highlights);
  }

  private renderOrAnimate(): void {
    if (!this.viewportEl) return;
    if (this.isPulseEnabled || !this.isAnimated) {
      this.renderBody();
      return;
    }
    // Animated transition between highlight states.
    const from = this.lastRenderedHighlights;
    const to = { ...this.highlights };
    this.lastRenderedHighlights = to;
    this.cancelTransition();

    const duration = Math.max(this.animationDuration, 0) * 1000;
    const start = performance.now();
    const ease = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const blended = blendHighlights(from, to, ease(t));
      this.buildSvgIntoViewport(blended);
      if (t < 1) {
        this.transitionFrame = requestAnimationFrame(step);
      }
    };
    this.transitionFrame = requestAnimationFrame(step);
  }

  private buildSvgIntoViewport(
    highlights: Partial<Record<Muscle, MuscleHighlight>>
  ): void {
    if (!this.viewportEl || !this.tooltipLayerEl) return;

    const newSvg = buildBodySvg(this.makeRenderState(highlights));
    if (this.svgEl) this.svgEl.remove();
    this.svgEl = newSvg;
    this.viewportEl.insertBefore(newSvg, this.tooltipLayerEl);

    this.applyAccessibility();
    finalizeGradients(newSvg);
    this.updateTooltips();

    if (this.isPulseEnabled) this.refreshPulseFactor();
  }

  // MARK: - Accessibility

  private applyAccessibility(): void {
    const svg = this.svgEl;
    if (!svg) return;
    svg.setAttribute('aria-label', translate('accessibility.bodyMap', this.locale));

    const basePaths = svg.querySelectorAll<SVGPathElement>('path[data-muscle]');
    for (const path of Array.from(basePaths)) {
      const muscle = path.getAttribute('data-muscle') as Muscle;
      if (muscle === 'head') continue;
      const selected = this.selectedSet.has(muscle);
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', '0');
      path.setAttribute('aria-label', muscleDisplayName(muscle, this.locale));
      path.setAttribute(
        'aria-pressed',
        selected ? 'true' : 'false'
      );
      path.style.outline = 'none';
      path.style.cursor = 'pointer';
      path.setAttribute(
        'aria-description',
        selected
          ? translate('accessibility.selected', this.locale)
          : translate('accessibility.notSelected', this.locale)
      );
      path.removeEventListener('keydown', this.onPathKeydown);
      path.addEventListener('keydown', this.onPathKeydown);
    }
  }

  private onPathKeydown = (event: KeyboardEvent): void => {
    const target = event.target as SVGPathElement | null;
    if (!target) return;
    const muscle = target.getAttribute('data-muscle') as Muscle | null;
    if (muscle && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.selectedCallback?.(muscle, 'both');
    }
  };

  // MARK: - Tooltips

  private updateTooltips(): void {
    const layer = this.tooltipLayerEl;
    const svg = this.svgEl;
    if (!layer || !svg) return;
    layer.replaceChildren();
    if (!this.tooltipRenderer) return;
    const viewportWidth = this.viewportEl?.clientWidth ?? svg.clientWidth;

    for (const muscle of this.selectedSet) {
      const rect = boundingRectFor(svg, muscle);
      if (!rect) continue;

      const anchorTop = svgUserToViewport(svg, { x: rect.x + rect.width / 2, y: rect.y });
      const anchorBottom = svgUserToViewport(svg, { x: rect.x + rect.width / 2, y: rect.y + rect.height });

      const content = this.tooltipRenderer(muscle, 'both');
      if (content == null) continue;

      const el = document.createElement('div');
      el.className = 'mm-tooltip';
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '10';
      if (typeof content === 'string') {
        el.innerHTML = content;
      } else {
        el.appendChild(content);
      }
      layer.appendChild(el);

      const padding = 8;
      let x = anchorTop.x;
      let y = anchorTop.y - el.offsetHeight / 2 - padding;
      if (y < el.offsetHeight / 2) {
        y = anchorBottom.y + el.offsetHeight / 2 + padding;
      }
      x = clamp(x, 60, viewportWidth - 60);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = 'translate(-50%, -50%)';
    }
  }

  // MARK: - Zoom application

  private applyZoom(): void {
    const zoom = this.zoomEl;
    if (!zoom) return;
    if (!this.isZoomEnabled) {
      zoom.style.transform = 'none';
      return;
    }
    const scale = clamp(this.zoomScale, this.minZoomScale, this.maxZoomScale);
    this.zoomScale = scale;
    if (scale <= this.minZoomScale) this.zoomOffset = { x: 0, y: 0 };
    zoom.style.transform = `translate(${this.zoomOffset.x}px, ${this.zoomOffset.y}px) scale(${scale})`;
    // Radial gradient radii are defined in screen px; re-layout them so they
    // keep the correct size under the current zoom scale.
    if (this.svgEl?.querySelector('[data-gradient]')) {
      finalizeGradients(this.svgEl);
    }
  }

  // MARK: - Gestures

  private onPointerDown = (event: PointerEvent): void => {
    this.svgEl?.setPointerCapture(event.pointerId);
    const info: PointerInfo = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startTime: performance.now(),
    };
    this.pointers.set(event.pointerId, info);

    if (this.pointers.size === 2) {
      this.clearLongPressTimer();
      this.dragStarted = false;
      this.longPressFired = false;
      const pts = [...this.pointers.values()];
      this.pinchStartDistance = Math.hypot(pts[0].lastX - pts[1].lastX, pts[0].lastY - pts[1].lastY) || 1;
      this.pinchStartScale = this.zoomScale;
    } else if (this.pointers.size === 1) {
      this.panStartOffset = { ...this.zoomOffset };
      this.dragStarted = false;
      this.longPressFired = false;

      if (this.longPressedCallback) {
        this.clearLongPressTimer();
        this.longPressTimer = setTimeout(() => {
          if (!this.dragStarted && !this.longPressFired && this.pointers.size === 1) {
            this.longPressFired = true;
            const result = this.hitTest({ x: event.clientX, y: event.clientY });
            if (result) this.longPressedCallback?.(result.muscle, result.side);
          }
        }, this.longPressDuration * 1000);
      }
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    const info = this.pointers.get(event.pointerId);
    if (!info) return;
    info.lastX = event.clientX;
    info.lastY = event.clientY;

    const dx = event.clientX - info.startX;
    const dy = event.clientY - info.startY;
    const distance = Math.hypot(dx, dy);

    // Pinch zoom
    if (this.pointers.size >= 2 && this.isZoomEnabled) {
      this.clearLongPressTimer();
      this.longPressFired = true;
      const pts = [...this.pointers.values()];
      const d = Math.hypot(pts[0].lastX - pts[1].lastX, pts[0].lastY - pts[1].lastY) || 1;
      const scale = clamp(
        this.pinchStartScale * (d / this.pinchStartDistance),
        this.minZoomScale,
        this.maxZoomScale
      );
      this.zoomScale = scale;
      this.applyZoom();
      return;
    }

    if (distance > 8) {
      this.clearLongPressTimer();
    }

    // Pan when zoomed
    if (this.isZoomEnabled && this.zoomScale > this.minZoomScale) {
      this.longPressFired = true;
      this.zoomOffset = {
        x: this.panStartOffset.x + dx,
        y: this.panStartOffset.y + dy,
      };
      this.applyZoom();
      return;
    }

    // Drag-to-select
    if (this.draggedCallback && !this.longPressFired && distance > 3) {
      this.dragStarted = true;
      this.pendingDragMove = { x: event.clientX, y: event.clientY };
      if (!this.dragFrame) {
        this.dragFrame = requestAnimationFrame(this.processDragMove);
      }
    }
  };

  private processDragMove = (): void => {
    this.dragFrame = 0;
    const point = this.pendingDragMove;
    this.pendingDragMove = null;
    if (!point) return;
    const result = this.hitTest(point);
    if (result) this.draggedCallback?.(result.muscle, result.side);
  };

  private onPointerUp = (event: PointerEvent): void => {
    const info = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    this.clearLongPressTimer();
    if (!info) return;

    const wasPinching = this.pointers.size === 1 && this.pinchStartDistance > 0;
    if (wasPinching) {
      this.pinchStartDistance = 0;
      if (this.zoomScale <= this.minZoomScale) {
        this.zoomOffset = { x: 0, y: 0 };
        this.applyZoom();
      }
    }
    if (this.pointers.size < 2) {
      this.pinchStartDistance = 0;
    }

    if (this.dragStarted) {
      this.dragStarted = false;
      this.dragEndedCallback?.();
      return;
    }

    if (this.longPressFired) {
      this.longPressFired = false;
      return;
    }

    // Tap (with double-tap-to-zoom support)
    const dx = event.clientX - info.startX;
    const dy = event.clientY - info.startY;
    const duration = performance.now() - info.startTime;
    const isTap = Math.hypot(dx, dy) < 10 && duration < (this.longPressDuration * 1000);

    if (isTap && this.isZoomEnabled) {
      const isDoubleTap =
        performance.now() - this.lastTapTime < 300 &&
        Math.hypot(event.clientX - this.lastTapX, event.clientY - this.lastTapY) < 10;
      this.lastTapTime = performance.now();
      this.lastTapX = event.clientX;
      this.lastTapY = event.clientY;

      if (isDoubleTap) {
        this.clearPendingTap();
        if (this.zoomScale > this.minZoomScale) {
          this.resetZoom();
        } else {
          this.zoomScale = Math.min(2, this.maxZoomScale);
          this.applyZoom();
        }
        return;
      }
      this.clearPendingTap();
      this.pendingTapTimer = setTimeout(() => {
        this.pendingTapTimer = null;
        this.fireTap(event.clientX, event.clientY);
      }, 250);
      return;
    }

    if (isTap) {
      this.fireTap(event.clientX, event.clientY);
    }
  };

  private onPointerCancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.clearLongPressTimer();
    this.dragStarted = false;
    this.pendingDragMove = null;
  };

  private fireTap(clientX: number, clientY: number): void {
    const result = this.hitTest({ x: clientX, y: clientY });
    if (result) this.selectedCallback?.(result.muscle, result.side);
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private clearPendingTap(): void {
    if (this.pendingTapTimer !== null) {
      clearTimeout(this.pendingTapTimer);
      this.pendingTapTimer = null;
    }
  }

  // MARK: - Pulse animation

  private startPulse(): void {
    this.stopPulse();
    const step = () => {
      if (!this.svgEl) return;
      const elapsed = performance.now() / 1000;
      const phase = (Math.sin(elapsed * this.pulseSpeed * Math.PI * 2) + 1) / 2;
      const factor =
        this.pulseRange[0] + phase * (this.pulseRange[1] - this.pulseRange[0]);
      this.applyPulseFactor(factor);
      this.pulseFrame = requestAnimationFrame(step);
    };
    this.pulseFrame = requestAnimationFrame(step);
  }

  private stopPulse(): void {
    if (this.pulseFrame) {
      cancelAnimationFrame(this.pulseFrame);
      this.pulseFrame = 0;
    }
  }

  private refreshPulseFactor(): void {
    // Re-apply the current pulse factor after a re-render so opacity stays correct.
    this.clearPulseOpacity();
  }

  private clearPulseOpacity(): void {
    const svg = this.svgEl;
    if (!svg) return;
    const paths = svg.querySelectorAll<SVGPathElement>('path[data-selected="true"]');
    for (const path of Array.from(paths)) {
      const base = Number(path.getAttribute('data-base-opacity') ?? 1);
      path.setAttribute('opacity', String(Math.round(base * 10000) / 10000));
    }
  }

  private applyPulseFactor(factor: number): void {
    const svg = this.svgEl;
    if (!svg) return;
    const paths = svg.querySelectorAll<SVGPathElement>('path[data-selected="true"]');
    for (const path of Array.from(paths)) {
      const base = Number(path.getAttribute('data-base-opacity') ?? 1);
      path.setAttribute('opacity', String(Math.round(base * factor * 10000) / 10000));
    }
  }

  private cancelTransition(): void {
    if (this.transitionFrame) {
      cancelAnimationFrame(this.transitionFrame);
      this.transitionFrame = 0;
    }
  }

  private cancelAnimationLoops(): void {
    this.cancelTransition();
    this.stopPulse();
    this.clearLongPressTimer();
    this.clearPendingTap();
    if (this.dragFrame) {
      cancelAnimationFrame(this.dragFrame);
      this.dragFrame = 0;
    }
  }
}

/** Blends previous and current highlights based on animation progress. */
function blendHighlights(
  previous: Partial<Record<Muscle, MuscleHighlight>>,
  current: Partial<Record<Muscle, MuscleHighlight>>,
  progress: number
): Partial<Record<Muscle, MuscleHighlight>> {
  const result: Partial<Record<Muscle, MuscleHighlight>> = {};
  const keys = new Set<Muscle>([
    ...(Object.keys(previous) as Muscle[]),
    ...(Object.keys(current) as Muscle[]),
  ]);

  for (const muscle of keys) {
    const prev = previous[muscle];
    const curr = current[muscle];

    if (!prev && curr) {
      result[muscle] = curr.withOpacity(curr.opacity * progress);
    } else if (prev && !curr) {
      result[muscle] = prev.withOpacity(prev.opacity * (1 - progress));
    } else if (prev && curr) {
      const blendedOpacity = prev.opacity + (curr.opacity - prev.opacity) * progress;
      const blendedFill = blendFills(prev.fill, curr.fill, progress);
      result[muscle] = Highlight.withFill(muscle, blendedFill, blendedOpacity);
    }
  }
  return result;
}

/** Blends two fills. Only color-to-color fills are interpolated. */
function blendFills(
  oldFill: MuscleHighlight['fill'],
  newFill: MuscleHighlight['fill'],
  progress: number
): MuscleHighlight['fill'] {
  if (oldFill.kind === 'color' && newFill.kind === 'color') {
    return { kind: 'color', color: interpolateColor(oldFill.color, newFill.color, progress) };
  }
  return progress < 0.5 ? oldFill : newFill;
}
