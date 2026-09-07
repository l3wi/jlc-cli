import { svgArcToCenter } from './svg-arc.js';

interface Point {
  x: number;
  y: number;
}

export interface SvgSubpath {
  points: { x: number; y: number }[];
  closed: boolean;
}

const MAX_POINTS = 100_000;
const MAX_DEPTH = 32;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const WHITESPACE = /[\t\n\r ]/;
const COMMANDS = 'MmLlHhVvCcSsQqTtAaZz';

class PathReader {
  position = 0;

  constructor(private readonly path: string) {}

  peek(): string {
    while (this.position < this.path.length && WHITESPACE.test(this.path[this.position])) {
      this.position++;
    }
    return this.path[this.position] ?? '';
  }

  number(allowComma: boolean, flag = false): number {
    if (this.peek() === ',' && allowComma) {
      this.position++;
      this.peek();
    }
    if (flag) {
      const value = this.path[this.position];
      if (value !== '0' && value !== '1') throw this.error('Expected arc flag 0 or 1');
      this.position++;
      return Number(value);
    }
    NUMBER.lastIndex = this.position;
    const match = NUMBER.exec(this.path);
    if (!match) throw this.error('Expected a number');
    this.position = NUMBER.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw this.error('Nonfinite number');
    return value;
  }

  error(message: string): Error {
    return new Error(`Invalid SVG path at offset ${this.position}: ${message}`);
  }
}

function point(x: number, y: number): Point {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Nonfinite SVG geometry');
  return { x, y };
}

function midpoint(a: Point, b: Point): Point {
  return point(a.x / 2 + b.x / 2, a.y / 2 + b.y / 2);
}

function reflected(control: Point, origin: Point): Point {
  return point(origin.x + (origin.x - control.x), origin.y + (origin.y - control.y));
}

function distanceToSegment(p: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p.x - start.x, p.y - start.y);
  const ux = dx / length;
  const uy = dy / length;
  const projection = Math.max(0, Math.min(length, (p.x - start.x) * ux + (p.y - start.y) * uy));
  return Math.hypot(p.x - start.x - projection * ux, p.y - start.y - projection * uy);
}

// A Bezier is inside its control polygon. The tolerance-wide capsule around
// the finite endpoint segment is convex, so bounding every control point's
// distance bounds the entire curve, including collinear reversals and loops.
function quadratic(a: Point, b: Point, c: Point, tolerance: number, append: (p: Point) => void, depth = 0): void {
  if (distanceToSegment(b, a, c) <= tolerance) {
    append(c);
    return;
  }
  if (depth >= MAX_DEPTH) throw new Error('SVG curve subdivision depth exceeded');
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const middle = midpoint(ab, bc);
  quadratic(a, ab, middle, tolerance, append, depth + 1);
  quadratic(middle, bc, c, tolerance, append, depth + 1);
}

function cubic(a: Point, b: Point, c: Point, d: Point, tolerance: number, append: (p: Point) => void, depth = 0): void {
  if (Math.max(distanceToSegment(b, a, d), distanceToSegment(c, a, d)) <= tolerance) {
    append(d);
    return;
  }
  if (depth >= MAX_DEPTH) throw new Error('SVG curve subdivision depth exceeded');
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const cd = midpoint(c, d);
  const abc = midpoint(ab, bc);
  const bcd = midpoint(bc, cd);
  const middle = midpoint(abc, bcd);
  cubic(a, ab, abc, middle, tolerance, append, depth + 1);
  cubic(middle, bcd, cd, d, tolerance, append, depth + 1);
}

function arc(start: Point, end: Point, rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean,
  tolerance: number, remaining: number, append: (p: Point) => void): void {
  // SVG omits arcs with coincident endpoints and replaces zero-radius arcs
  // with straight lines. Handle these before the center conversion divides.
  if (start.x === end.x && start.y === end.y) return;
  if (rx === 0 || ry === 0) {
    append(end);
    return;
  }
  const phi = rotation % 360;
  const center = svgArcToCenter({ x1: start.x, y1: start.y, x2: end.x, y2: end.y,
    rx: Math.abs(rx), ry: Math.abs(ry), phi, largeArc, sweep });
  if (!center || !Number.isFinite(center.cx) || !Number.isFinite(center.cy)
    || !Number.isFinite(center.rx) || !Number.isFinite(center.ry)
    || !Number.isFinite(center.startAngle) || !Number.isFinite(center.deltaAngle)
    || center.rx <= 0 || center.ry <= 0 || center.deltaAngle === 0) {
    throw new Error('Cannot represent SVG arc center with finite geometry');
  }
  // Linear interpolation error is <= max|p''(angle)| * step^2 / 8.
  // Rotation preserves this norm, and max|p''| <= max(rx, ry).
  // Reserve half the error budget for endpoint reconstruction roundoff.
  const step = Math.min(Math.PI / 2, Math.sqrt(tolerance / Math.max(center.rx, center.ry)) * 2);
  const segments = Math.max(1, Math.ceil(Math.abs(center.deltaAngle) / step));
  if (!Number.isFinite(segments) || segments > remaining) throw new Error('SVG path point limit exceeded');
  const phiRad = phi * Math.PI / 180;
  const cosPhi = Math.cos(phiRad);
  const sinPhi = Math.sin(phiRad);
  for (let i = 0; i <= 1; i++) {
    const angle = center.startAngle + center.deltaAngle * i;
    const x = center.rx * Math.cos(angle);
    const y = center.ry * Math.sin(angle);
    const endpoint = i === 0 ? start : end;
    const error = Math.hypot(center.cx + cosPhi * x - sinPhi * y - endpoint.x,
      center.cy + sinPhi * x + cosPhi * y - endpoint.y);
    if (!Number.isFinite(error) || error > tolerance / 2) {
      throw new Error('SVG arc endpoint precision exceeds tolerance');
    }
  }
  for (let i = 1; i < segments; i++) {
    const angle = center.startAngle + center.deltaAngle * (i / segments);
    const x = center.rx * Math.cos(angle);
    const y = center.ry * Math.sin(angle);
    append(point(center.cx + cosPhi * x - sinPhi * y, center.cy + sinPhi * x + cosPhi * y));
  }
  append(end);
}

/** Flatten SVG path data in its original coordinate units, without joining subpaths.
 * Closed paths use metadata rather than a duplicated closing vertex. Curves are
 * bounded by tolerance; excessive subdivision or unrepresentable geometry throws.
 */
export function flattenSvgPath(path: string, tolerance: number): SvgSubpath[] {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('SVG tolerance must be finite and positive');
  const reader = new PathReader(path);
  const subpaths: SvgSubpath[] = [];
  let active: SvgSubpath | undefined;
  let current: Point = { x: 0, y: 0 };
  let start = current;
  let command = '';
  let previous = '';
  let cubicControl: Point | undefined;
  let quadraticControl: Point | undefined;
  let count = 0;
  const append = (p: Point): void => {
    if (++count > MAX_POINTS) throw new Error('SVG path point limit exceeded');
    active!.points.push(p);
  };
  const begin = (p: Point): void => {
    active = { points: [], closed: false };
    subpaths.push(active);
    start = p;
    append(p);
  };

  while (reader.peek()) {
    const token = reader.peek();
    const explicit = COMMANDS.includes(token);
    if (explicit) {
      command = token;
      reader.position++;
    } else if (!command || /[a-z]/i.test(token)) {
      throw reader.error('Expected a supported command');
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (subpaths.length === 0 && upper !== 'M') throw reader.error('Path must begin with moveto');
    if (upper === 'Z') {
      if (active) active.closed = true;
      current = start;
      active = undefined;
      cubicControl = quadraticControl = undefined;
      previous = upper;
      command = '';
      continue;
    }

    let first = true;
    const number = (flag = false): number => {
      const value = reader.number(!first || !explicit, flag);
      first = false;
      return value;
    };
    const coordinate = (): Point => {
      const x = number();
      const y = number();
      return point(x + (relative ? current.x : 0), y + (relative ? current.y : 0));
    };
    if (upper !== 'M' && !active) begin(current);
    let nextCubic: Point | undefined;
    let nextQuadratic: Point | undefined;
    switch (upper) {
      case 'M':
        current = coordinate();
        begin(current);
        command = relative ? 'l' : 'L';
        break;
      case 'L':
        current = coordinate();
        append(current);
        break;
      case 'H':
        current = point(number() + (relative ? current.x : 0), current.y);
        append(current);
        break;
      case 'V':
        current = point(current.x, number() + (relative ? current.y : 0));
        append(current);
        break;
      case 'C': {
        const control1 = coordinate();
        nextCubic = coordinate();
        const end = coordinate();
        cubic(current, control1, nextCubic, end, tolerance, append);
        current = end;
        break;
      }
      case 'S': {
        const control1 = (previous === 'C' || previous === 'S') && cubicControl ? reflected(cubicControl, current) : current;
        nextCubic = coordinate();
        const end = coordinate();
        cubic(current, control1, nextCubic, end, tolerance, append);
        current = end;
        break;
      }
      case 'Q': {
        nextQuadratic = coordinate();
        const end = coordinate();
        quadratic(current, nextQuadratic, end, tolerance, append);
        current = end;
        break;
      }
      case 'T': {
        nextQuadratic = (previous === 'Q' || previous === 'T') && quadraticControl ? reflected(quadraticControl, current) : current;
        const end = coordinate();
        quadratic(current, nextQuadratic, end, tolerance, append);
        current = end;
        break;
      }
      case 'A': {
        const rx = number();
        const ry = number();
        const rotation = number();
        const largeArc = number(true) === 1;
        const sweep = number(true) === 1;
        const end = coordinate();
        arc(current, end, rx, ry, rotation, largeArc, sweep, tolerance, MAX_POINTS - count, append);
        current = end;
        break;
      }
      default:
        throw reader.error('Unsupported command');
    }
    cubicControl = nextCubic;
    quadraticControl = nextQuadratic;
    previous = upper;
  }
  return subpaths;
}
