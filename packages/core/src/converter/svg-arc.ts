/**
 * SVG Arc to Center Parameterization
 *
 * Converts SVG arc endpoint parameters to center point format used by KiCad.
 * Based on SVG specification: https://www.w3.org/TR/SVG/implnote.html#ArcConversionEndpointToCenter
 */

export interface ArcEndpointParams {
  x1: number;      // Start point X
  y1: number;      // Start point Y
  rx: number;      // X radius
  ry: number;      // Y radius
  phi: number;     // X-axis rotation in degrees
  largeArc: boolean;  // Large arc flag
  sweep: boolean;     // Sweep flag (clockwise)
  x2: number;      // End point X
  y2: number;      // End point Y
}

export interface ArcCenterParams {
  cx: number;         // Center X
  cy: number;         // Center Y
  rx: number;         // Corrected X radius
  ry: number;         // Corrected Y radius
  startAngle: number; // Start angle in radians
  endAngle: number;   // End angle in radians
  deltaAngle: number; // Arc sweep in radians (negative = clockwise)
}

/**
 * Convert SVG arc endpoint parameterization to center parameterization
 * Algorithm from SVG spec Appendix B.2.4
 */
export function svgArcToCenter(params: ArcEndpointParams): ArcCenterParams | null {
  const { x1, y1, x2, y2, largeArc, sweep } = params;
  let { rx, ry, phi } = params;

  // Convert rotation to radians
  const phiRad = (phi * Math.PI) / 180;
  const cosPhi = Math.cos(phiRad);
  const sinPhi = Math.sin(phiRad);

  // Step 1: Compute (x1', y1') - midpoint in rotated coordinates
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Ensure radii are positive
  rx = Math.abs(rx);
  ry = Math.abs(ry);

  // Check for degenerate cases
  if (rx === 0 || ry === 0) {
    return null; // Line, not an arc
  }

  // Step 2: Correct out-of-range radii
  // Ensure radii are large enough
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx = sqrtLambda * rx;
    ry = sqrtLambda * ry;
  }

  // Step 3: Compute (cx', cy') - center in rotated coordinates
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  let sq = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2);
  if (sq < 0) sq = 0; // Numerical precision fix

  let coef = Math.sqrt(sq);
  if (largeArc === sweep) {
    coef = -coef;
  }

  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  // Step 4: Compute (cx, cy) from (cx', cy')
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 5: Compute start angle and delta angle
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  // Angle between two vectors
  const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / len))); // Clamp for numerical stability
    if (ux * vy - uy * vx < 0) {
      angle = -angle;
    }
    return angle;
  };

  // Start angle (angle from positive x-axis to start point vector)
  const startAngle = vectorAngle(1, 0, ux, uy);

  // Delta angle (sweep)
  let deltaAngle = vectorAngle(ux, uy, vx, vy);

  // Adjust delta based on sweep flag
  if (!sweep && deltaAngle > 0) {
    deltaAngle -= 2 * Math.PI;
  } else if (sweep && deltaAngle < 0) {
    deltaAngle += 2 * Math.PI;
  }

  const endAngle = startAngle + deltaAngle;

  return {
    cx,
    cy,
    rx,
    ry,
    startAngle,
    endAngle,
    deltaAngle,
  };
}

/**
 * Parse SVG arc path and extract parameters
 * Format: "M x1 y1 A rx ry rotation largeArc sweep x2 y2"
 */
export function parseSvgArcPath(path: string): ArcEndpointParams | null {
  try {
    // Normalize path - handle both space and comma separators
    const normalized = path.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

    // Match M x y A rx ry rotation largeArc sweep x y
    const match = normalized.match(
      /M\s*(-?[\d.]+)\s+(-?[\d.]+)\s*A\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([01])\s+([01])\s+(-?[\d.]+)\s+(-?[\d.]+)/i
    );

    if (!match) {
      return null;
    }

    return {
      x1: parseFloat(match[1]),
      y1: parseFloat(match[2]),
      rx: parseFloat(match[3]),
      ry: parseFloat(match[4]),
      phi: parseFloat(match[5]),
      largeArc: match[6] === '1',
      sweep: match[7] === '1',
      x2: parseFloat(match[8]),
      y2: parseFloat(match[9]),
    };
  } catch {
    return null;
  }
}

/**
 * Convert radians to degrees
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Normalize angle to 0-360 range
 */
export function normalizeAngle(degrees: number): number {
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  return degrees;
}

/**
 * Point type for arc interpolation
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Interpolate points along an SVG arc
 * Used for converting arc curves to polygon vertices in SOLIDREGION paths
 *
 * @param params Arc endpoint parameters from SVG path
 * @param segmentsPerQuarter Number of points per 90 degrees of arc (default: 4)
 * @returns Array of points along the arc (excluding start point, including end point)
 */
export function interpolateArc(params: ArcEndpointParams, segmentsPerQuarter = 4): Point[] {
  const center = svgArcToCenter(params);
  if (!center) {
    // Degenerate arc (zero radius) - return just the endpoint
    return [{ x: params.x2, y: params.y2 }];
  }

  const { cx, cy, rx, ry, startAngle, deltaAngle } = center;
  const phiRad = (params.phi * Math.PI) / 180;
  const cosPhi = Math.cos(phiRad);
  const sinPhi = Math.sin(phiRad);

  // Calculate number of segments based on arc sweep
  const arcDegrees = Math.abs(deltaAngle) * (180 / Math.PI);
  const numSegments = Math.max(2, Math.ceil((arcDegrees / 90) * segmentsPerQuarter));

  const points: Point[] = [];

  // Sample points along the arc (start at i=1 to skip start point, which caller already has)
  for (let i = 1; i <= numSegments; i++) {
    const t = i / numSegments;
    const angle = startAngle + deltaAngle * t;

    // Point on ellipse (before rotation)
    const px = rx * Math.cos(angle);
    const py = ry * Math.sin(angle);

    // Apply rotation and translate to center
    const x = cosPhi * px - sinPhi * py + cx;
    const y = sinPhi * px + cosPhi * py + cy;

    points.push({ x, y });
  }

  return points;
}
