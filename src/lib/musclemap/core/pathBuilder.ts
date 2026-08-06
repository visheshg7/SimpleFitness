/**
 * Builds a scaled/offset SVG path `d` string from a raw SVG path.
 *
 * Direct port of `PathBuilder.swift`. In the web renderer the body is drawn by
 * letting the browser scale paths via the SVG `viewBox`, but this builder is
 * kept for parity (e.g. Canvas rendering or hit testing without a DOM) and
 * produces the same geometry the Swift version does.
 */

import { parseSvgPath, type SVGPathCommand } from './svgPathParser';

function fmt(n: number): string {
  const v = Math.round(n * 10000) / 10000;
  return Object.is(v, -0) ? '0' : String(v);
}

function resolvePoint(
  currentPoint: { x: number; y: number },
  x: number,
  y: number,
  relative: boolean
): { x: number; y: number } {
  return relative
    ? { x: currentPoint.x + x, y: currentPoint.y + y }
    : { x, y };
}

/**
 * Builds an SVG path `d` string from `svgPath`, applying a uniform scale and
 * translation to every point (mirrors the Swift `PathBuilder`).
 */
export function buildSvgPathD(
  svgPath: string,
  scale: number,
  offsetX: number,
  offsetY: number
): string {
  const commands = parseSvgPath(svgPath);
  const parts: string[] = [];

  let currentPoint = { x: 0, y: 0 };
  let lastControlPoint: { x: number; y: number } | null = null;
  let startPoint = { x: 0, y: 0 };

  const scaled = (p: { x: number; y: number }) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  });

  for (const command of commands) {
    switch (command.type) {
      case 'M': {
        const point = resolvePoint(currentPoint, command.x, command.y, command.relative);
        const s = scaled(point);
        parts.push(`M ${fmt(s.x)} ${fmt(s.y)}`);
        currentPoint = point;
        startPoint = point;
        lastControlPoint = null;
        break;
      }
      case 'L': {
        const point = resolvePoint(currentPoint, command.x, command.y, command.relative);
        const s = scaled(point);
        parts.push(`L ${fmt(s.x)} ${fmt(s.y)}`);
        currentPoint = point;
        lastControlPoint = null;
        break;
      }
      case 'H': {
        const point = command.relative
          ? { x: currentPoint.x + command.x, y: currentPoint.y }
          : { x: command.x, y: currentPoint.y };
        const s = scaled(point);
        parts.push(`L ${fmt(s.x)} ${fmt(s.y)}`);
        currentPoint = point;
        lastControlPoint = null;
        break;
      }
      case 'V': {
        const point = command.relative
          ? { x: currentPoint.x, y: currentPoint.y + command.y }
          : { x: currentPoint.x, y: command.y };
        const s = scaled(point);
        parts.push(`L ${fmt(s.x)} ${fmt(s.y)}`);
        currentPoint = point;
        lastControlPoint = null;
        break;
      }
      case 'C': {
        const control1 = resolvePoint(currentPoint, command.x1, command.y1, command.relative);
        const control2 = resolvePoint(currentPoint, command.x2, command.y2, command.relative);
        const end = resolvePoint(currentPoint, command.x, command.y, command.relative);
        const c1 = scaled(control1);
        const c2 = scaled(control2);
        const e = scaled(end);
        parts.push(`C ${fmt(c1.x)} ${fmt(c1.y)}, ${fmt(c2.x)} ${fmt(c2.y)}, ${fmt(e.x)} ${fmt(e.y)}`);
        currentPoint = end;
        lastControlPoint = control2;
        break;
      }
      case 'S': {
        const control1 = lastControlPoint
          ? {
              x: 2 * currentPoint.x - lastControlPoint.x,
              y: 2 * currentPoint.y - lastControlPoint.y,
            }
          : { ...currentPoint };
        const control2 = resolvePoint(currentPoint, command.x2, command.y2, command.relative);
        const end = resolvePoint(currentPoint, command.x, command.y, command.relative);
        const c1 = scaled(control1);
        const c2 = scaled(control2);
        const e = scaled(end);
        parts.push(`C ${fmt(c1.x)} ${fmt(c1.y)}, ${fmt(c2.x)} ${fmt(c2.y)}, ${fmt(e.x)} ${fmt(e.y)}`);
        currentPoint = end;
        lastControlPoint = control2;
        break;
      }
      case 'Q': {
        const control = resolvePoint(currentPoint, command.x1, command.y1, command.relative);
        const end = resolvePoint(currentPoint, command.x, command.y, command.relative);
        const c = scaled(control);
        const e = scaled(end);
        parts.push(`Q ${fmt(c.x)} ${fmt(c.y)}, ${fmt(e.x)} ${fmt(e.y)}`);
        currentPoint = end;
        lastControlPoint = control;
        break;
      }
      case 'T': {
        const control: { x: number; y: number } = lastControlPoint
          ? {
              x: 2 * currentPoint.x - lastControlPoint.x,
              y: 2 * currentPoint.y - lastControlPoint.y,
            }
          : { ...currentPoint };
        const end = resolvePoint(currentPoint, command.x, command.y, command.relative);
        const c = scaled(control);
        const e = scaled(end);
        parts.push(`Q ${fmt(c.x)} ${fmt(c.y)}, ${fmt(e.x)} ${fmt(e.y)}`);
        currentPoint = end;
        lastControlPoint = control;
        break;
      }
      case 'A': {
        // The Swift renderer approximates arcs with straight lines.
        const end = resolvePoint(currentPoint, command.x, command.y, command.relative);
        const e = scaled(end);
        parts.push(`L ${fmt(e.x)} ${fmt(e.y)}`);
        currentPoint = end;
        lastControlPoint = null;
        break;
      }
      case 'Z':
        parts.push('Z');
        currentPoint = { ...startPoint };
        lastControlPoint = null;
        break;
      default: {
        const exhaustive: never = command;
        void exhaustive;
      }
    }
  }

  return parts.join(' ');
}

/**
 * Returns the (unscaled) SVG path commands for a muscle path string.
 * Convenience wrapper around `parseSvgPath`.
 */
export function svgCommandsFor(pathString: string): SVGPathCommand[] {
  return parseSvgPath(pathString);
}
