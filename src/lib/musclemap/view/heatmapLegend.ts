/**
 * A color bar legend that displays the heatmap color scale.
 *
 * Direct port of `HeatmapLegendView.swift`.
 */

import { HeatmapColorScale } from '../heatmap/heatmapColorScale';
import type { ColorInterpolation } from '../heatmap/colorInterpolation';
import { toCss } from '../core/color';
import { translate, type Locale } from './localization';

export interface HeatmapLegendOptions {
  colorScale?: HeatmapColorScale;
  interpolation?: ColorInterpolation;
  orientation?: 'horizontal' | 'vertical';
  barThickness?: number;
  labelMin?: string;
  labelMax?: string;
  steps?: number;
  locale?: Locale;
}

/**
 * Renders a heatmap intensity legend as an SVG color bar with min/max labels.
 */
export class HeatmapLegend {
  private colorScale: HeatmapColorScale;
  private interpolation: ColorInterpolation;
  private orientation: 'horizontal' | 'vertical';
  private barThickness: number;
  private labelMin: string;
  private labelMax: string;
  private steps: number;
  private locale: Locale;

  private container: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private labelMinEl: HTMLElement | null = null;
  private labelMaxEl: HTMLElement | null = null;

  constructor(options: HeatmapLegendOptions = {}) {
    this.colorScale = options.colorScale ?? HeatmapColorScale.workout;
    this.interpolation = options.interpolation ?? this.colorScale.interpolation;
    this.orientation = options.orientation ?? 'horizontal';
    this.barThickness = options.barThickness ?? 16;
    this.locale = options.locale ?? 'en';
    this.labelMin = options.labelMin ?? translate('legend.low', this.locale);
    this.labelMax = options.labelMax ?? translate('legend.high', this.locale);
    this.steps = Math.max(options.steps ?? 32, 2);
  }

  setColorScale(scale: HeatmapColorScale): void {
    this.colorScale = scale;
    this.redraw();
  }

  setInterpolation(interpolation: ColorInterpolation): void {
    this.interpolation = interpolation;
    this.redraw();
  }

  setOrientation(orientation: 'horizontal' | 'vertical'): void {
    this.orientation = orientation;
    this.redraw();
  }

  setBarThickness(thickness: number): void {
    this.barThickness = thickness;
    this.redraw();
  }

  setLabels(labelMin?: string, labelMax?: string): void {
    if (labelMin !== undefined) this.labelMin = labelMin;
    if (labelMax !== undefined) this.labelMax = labelMax;
    this.redraw();
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.labelMin = translate('legend.low', locale);
    this.labelMax = translate('legend.high', locale);
    this.redraw();
  }

  /** Mounts the legend into a container (selector or element). */
  mount(target: string | HTMLElement): this {
    const container =
      typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
    if (!container) {
      throw new Error(`MuscleMap: heatmap legend target not found: ${target}`);
    }
    this.unmount();
    this.container = container;
    this.buildDom();
    return this;
  }

  /** Removes the legend from the DOM. */
  unmount(): void {
    if (this.container) {
      this.container.replaceChildren();
      this.container = null;
      this.svg = null;
      this.labelMinEl = null;
      this.labelMaxEl = null;
    }
  }

  private buildDom(): void {
    const container = this.container;
    if (!container) return;
    container.replaceChildren();

    const isHorizontal = this.orientation === 'horizontal';

    const root = document.createElement('div');
    root.className = 'mm-legend';
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.gap = '6px';
    root.setAttribute('role', 'img');
    root.setAttribute(
      'aria-label',
      translate('accessibility.heatmapLegend', this.locale)
    );

    if (isHorizontal) {
      root.style.flexDirection = 'column';
      root.style.alignItems = 'stretch';
      const bar = this.buildBar();
      bar.style.height = `${this.barThickness}px`;
      root.appendChild(bar);

      const labels = document.createElement('div');
      labels.style.display = 'flex';
      labels.style.justifyContent = 'space-between';
      labels.style.fontSize = '10px';
      labels.style.color = '#666';
      this.labelMinEl = document.createElement('span');
      this.labelMinEl.textContent = this.labelMin;
      this.labelMaxEl = document.createElement('span');
      this.labelMaxEl.textContent = this.labelMax;
      labels.append(this.labelMinEl, this.labelMaxEl);
      root.appendChild(labels);
    } else {
      const labels = document.createElement('div');
      labels.style.display = 'flex';
      labels.style.flexDirection = 'column';
      labels.style.justifyContent = 'space-between';
      labels.style.fontSize = '10px';
      labels.style.color = '#666';
      this.labelMaxEl = document.createElement('span');
      this.labelMaxEl.textContent = this.labelMax;
      this.labelMinEl = document.createElement('span');
      this.labelMinEl.textContent = this.labelMin;
      labels.append(this.labelMaxEl, this.labelMinEl);
      root.appendChild(labels);

      const bar = this.buildBar();
      bar.style.width = `${this.barThickness}px`;
      root.appendChild(bar);
    }

    container.appendChild(root);
  }

  private buildBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.position = 'relative';
    bar.style.flex = '1';
    bar.style.overflow = 'hidden';
    bar.style.borderRadius = `${Math.max(this.barThickness / 4, 2)}px`;
    bar.style.minWidth = this.orientation === 'horizontal' ? '40px' : '0';
    bar.style.minHeight = this.orientation === 'vertical' ? '40px' : '0';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.setAttribute('preserveAspectRatio', 'none');
    bar.appendChild(svg);
    this.svg = svg;

    const { width, height } = bar.getBoundingClientRect();
    this.drawBar(width, height);

    // Redraw when the container resizes.
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !this.svg) return;
      const rect = entry.target.getBoundingClientRect();
      this.drawBar(rect.width, rect.height);
    });
    this.resizeObserver.observe(bar);

    return bar;
  }

  private resizeObserver: ResizeObserver | null = null;

  private drawBar(width: number, height: number): void {
    const svg = this.svg;
    if (!svg) return;
    svg.replaceChildren();

    const count = this.steps;
    const isHorizontal = this.orientation === 'horizontal';
    const ns = 'http://www.w3.org/2000/svg';

    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      const curved = this.interpolation.apply(t);
      const color = this.colorScale.colorFor(curved);
      const css = toCss(color);

      const rect = document.createElementNS(ns, 'rect');
      if (isHorizontal) {
        const stepWidth = width / count;
        rect.setAttribute('x', String(i * stepWidth));
        rect.setAttribute('y', '0');
        rect.setAttribute('width', String(stepWidth + 1));
        rect.setAttribute('height', String(height));
      } else {
        const stepHeight = height / count;
        const invertedI = count - 1 - i;
        rect.setAttribute('x', '0');
        rect.setAttribute('y', String(invertedI * stepHeight));
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(stepHeight + 1));
      }
      rect.setAttribute('fill', css);
      svg.appendChild(rect);
    }
  }

  private redraw(): void {
    if (this.labelMinEl) this.labelMinEl.textContent = this.labelMin;
    if (this.labelMaxEl) this.labelMaxEl.textContent = this.labelMax;
    if (this.svg) {
      const parent = this.svg.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        this.drawBar(rect.width, rect.height);
      }
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unmount();
  }
}
