/**
 * A minimal SVG path command parser.
 *
 * Direct port of `SVGPathParser.swift`. Handles relative/absolute variants,
 * commas, exponents, and arc flags.
 */

export type SVGPathCommand =
  | { type: 'M'; x: number; y: number; relative: boolean }
  | { type: 'L'; x: number; y: number; relative: boolean }
  | { type: 'H'; x: number; relative: boolean }
  | { type: 'V'; y: number; relative: boolean }
  | {
      type: 'C';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
      relative: boolean;
    }
  | { type: 'S'; x2: number; y2: number; x: number; y: number; relative: boolean }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number; relative: boolean }
  | { type: 'T'; x: number; y: number; relative: boolean }
  | {
      type: 'A';
      rx: number;
      ry: number;
      angle: number;
      largeArc: boolean;
      sweep: boolean;
      x: number;
      y: number;
      relative: boolean;
    }
  | { type: 'Z' };

function isLetter(ch: string): boolean {
  return /[a-zA-Z]/.test(ch);
}

/**
 * Parses an SVG path `d` string into a list of commands.
 */
export function parseSvgPath(pathString: string): SVGPathCommand[] {
  const commands: SVGPathCommand[] = [];
  let index = 0;
  let currentCommand = 'M';

  function skipWhitespaceAndCommas(): void {
    while (index < pathString.length) {
      const char = pathString[index];
      if (char === ' ' || char === ',' || char === '\n' || char === '\t') {
        index += 1;
      } else {
        break;
      }
    }
  }

  function parseNumber(): number | undefined {
    skipWhitespaceAndCommas();
    if (index >= pathString.length) return undefined;

    let numStr = '';
    let hasDecimal = false;
    let hasExponent = false;

    const sign = pathString[index];
    if (sign === '-' || sign === '+') {
      numStr += sign;
      index += 1;
    }

    while (index < pathString.length) {
      const char = pathString[index];
      if (/[0-9]/.test(char)) {
        numStr += char;
        index += 1;
      } else if (char === '.' && !hasDecimal && !hasExponent) {
        hasDecimal = true;
        numStr += char;
        index += 1;
      } else if ((char === 'e' || char === 'E') && !hasExponent) {
        hasExponent = true;
        numStr += char;
        index += 1;
        const exponentSign = pathString[index];
        if (index < pathString.length && (exponentSign === '-' || exponentSign === '+')) {
          numStr += exponentSign;
          index += 1;
        }
      } else {
        break;
      }
    }

    const value = parseFloat(numStr);
    return Number.isNaN(value) ? undefined : value;
  }

  function parseFlag(): boolean | undefined {
    skipWhitespaceAndCommas();
    if (index >= pathString.length) return undefined;
    const char = pathString[index];
    if (char === '0' || char === '1') {
      index += 1;
      return char === '1';
    }
    return undefined;
  }

  while (index < pathString.length) {
    skipWhitespaceAndCommas();
    if (index >= pathString.length) break;

    const char = pathString[index];

    if (isLetter(char) && char !== 'e' && char !== 'E') {
      currentCommand = char;
      index += 1;
    }

    const isRelative = currentCommand === currentCommand.toLowerCase();
    const cmd = currentCommand.toUpperCase();

    switch (cmd) {
      case 'M': {
        const x = parseNumber();
        const y = parseNumber();
        if (x !== undefined && y !== undefined) {
          commands.push({ type: 'M', x, y, relative: isRelative });
          // Implicit `l` after an initial `m` (per SVG spec).
          currentCommand = isRelative ? 'l' : 'L';
        }
        break;
      }
      case 'L': {
        const x = parseNumber();
        const y = parseNumber();
        if (x !== undefined && y !== undefined) {
          commands.push({ type: 'L', x, y, relative: isRelative });
        }
        break;
      }
      case 'H': {
        const x = parseNumber();
        if (x !== undefined) {
          commands.push({ type: 'H', x, relative: isRelative });
        }
        break;
      }
      case 'V': {
        const y = parseNumber();
        if (y !== undefined) {
          commands.push({ type: 'V', y, relative: isRelative });
        }
        break;
      }
      case 'C': {
        const x1 = parseNumber();
        const y1 = parseNumber();
        const x2 = parseNumber();
        const y2 = parseNumber();
        const x = parseNumber();
        const y = parseNumber();
        if (
          x1 !== undefined &&
          y1 !== undefined &&
          x2 !== undefined &&
          y2 !== undefined &&
          x !== undefined &&
          y !== undefined
        ) {
          commands.push({ type: 'C', x1, y1, x2, y2, x, y, relative: isRelative });
        }
        break;
      }
      case 'S': {
        const x2 = parseNumber();
        const y2 = parseNumber();
        const x = parseNumber();
        const y = parseNumber();
        if (x2 !== undefined && y2 !== undefined && x !== undefined && y !== undefined) {
          commands.push({ type: 'S', x2, y2, x, y, relative: isRelative });
        }
        break;
      }
      case 'Q': {
        const x1 = parseNumber();
        const y1 = parseNumber();
        const x = parseNumber();
        const y = parseNumber();
        if (x1 !== undefined && y1 !== undefined && x !== undefined && y !== undefined) {
          commands.push({ type: 'Q', x1, y1, x, y, relative: isRelative });
        }
        break;
      }
      case 'T': {
        const x = parseNumber();
        const y = parseNumber();
        if (x !== undefined && y !== undefined) {
          commands.push({ type: 'T', x, y, relative: isRelative });
        }
        break;
      }
      case 'A': {
        const rx = parseNumber();
        const ry = parseNumber();
        const angle = parseNumber();
        const largeArc = parseFlag();
        const sweep = parseFlag();
        const x = parseNumber();
        const y = parseNumber();
        if (
          rx !== undefined &&
          ry !== undefined &&
          angle !== undefined &&
          largeArc !== undefined &&
          sweep !== undefined &&
          x !== undefined &&
          y !== undefined
        ) {
          commands.push({
            type: 'A',
            rx,
            ry,
            angle,
            largeArc,
            sweep,
            x,
            y,
            relative: isRelative,
          });
        }
        break;
      }
      case 'Z':
        commands.push({ type: 'Z' });
        break;
      default:
        index += 1;
        break;
    }
  }

  return commands;
}
