/**
 * KiCad S-Expression to SVG Renderer
 * Renders KiCad symbols and footprints from S-expression format
 */

import {
  parseSExpr,
  isList,
  isAtom,
  getTag,
  findChild,
  findChildren,
  getAttr,
  getNumericAttr,
  getPoint,
  getPointWithRotation,
  getSize,
  getStroke,
  getFillType,
  getPoints,
  getLayers,
  type SExpr,
} from './sexpr-parser.js'

// Color schemes
const SYMBOL_COLORS = {
  background: '#FFFFF8',  // Warm white
  body: '#840000',        // Dark red for outlines
  bodyFill: '#FFFFC4',    // Pale yellow fill
  pin: '#840000',         // Dark red for pins
  pinText: '#008484',     // Teal for pin names/numbers
  text: '#000000',        // Black for text
}

const FOOTPRINT_COLORS = {
  background: '#000000',  // Black
  // Copper layers (KiCad defaults)
  fCu: '#840000',         // F.Cu - dark red
  bCu: '#008400',         // B.Cu - green
  in1Cu: '#C2C200',       // In1.Cu - yellow
  in2Cu: '#C200C2',       // In2.Cu - magenta
  // Silkscreen
  fSilkS: '#008484',      // F.SilkS - teal
  bSilkS: '#840084',      // B.SilkS - purple
  // Solder mask
  fMask: '#840084',       // F.Mask - purple
  bMask: '#848400',       // B.Mask - olive
  // Paste
  fPaste: '#840000',      // F.Paste - dark red
  bPaste: '#00C2C2',      // B.Paste - cyan
  // Fabrication
  fFab: '#848484',        // F.Fab - gray
  bFab: '#000084',        // B.Fab - dark blue
  // Courtyard
  fCrtYd: '#C2C2C2',      // F.CrtYd - light gray
  bCrtYd: '#848484',      // B.CrtYd - gray
  // Other layers
  edgeCuts: '#C2C200',    // Edge.Cuts - yellow
  dwgsUser: '#C2C2C2',    // Dwgs.User - light gray
  cmtsUser: '#000084',    // Cmts.User - dark blue
  margin: '#C200C2',      // Margin - magenta
  // Pads
  padFront: '#840000',    // Front SMD pads - red
  padBack: '#008400',     // Back SMD pads - green
  padThruHole: '#C2C200', // THT pads - yellow
  drill: '#848484',       // Drill holes - gray
}

// Scale factor: KiCad uses mm, we render with pixels per mm
const SYMBOL_SCALE = 10   // pixels per mm for symbols
const FOOTPRINT_SCALE = 20 // pixels per mm for footprints

interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Escape text for SVG
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render KiCad symbol S-expression to SVG
 */
export function renderSymbolSvg(sexpr: string): string {
  if (!sexpr || sexpr.trim() === '') {
    return createErrorSvg('No symbol data')
  }

  try {
    const parsed = parseSExpr(sexpr)
    if (!isList(parsed) || getTag(parsed) !== 'symbol') {
      return createErrorSvg('Invalid symbol format')
    }

    const elements: string[] = []
    const bounds: BoundingBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

    // Find all symbol units (graphics and pins)
    const units = findChildren(parsed, 'symbol')

    for (const unit of units) {
      // Render rectangles
      for (const rect of findChildren(unit, 'rectangle')) {
        const svg = renderSymbolRectangle(rect, bounds)
        if (svg) elements.push(svg)
      }

      // Render polylines
      for (const polyline of findChildren(unit, 'polyline')) {
        const svg = renderSymbolPolyline(polyline, bounds)
        if (svg) elements.push(svg)
      }

      // Render circles
      for (const circle of findChildren(unit, 'circle')) {
        const svg = renderSymbolCircle(circle, bounds)
        if (svg) elements.push(svg)
      }

      // Render arcs
      for (const arc of findChildren(unit, 'arc')) {
        const svg = renderSymbolArc(arc, bounds)
        if (svg) elements.push(svg)
      }

      // Render pins
      for (const pin of findChildren(unit, 'pin')) {
        const svg = renderSymbolPin(pin, bounds)
        if (svg) elements.push(svg)
      }
    }

    // Add some padding to bounds
    const padding = 5
    if (!isFinite(bounds.minX)) {
      bounds.minX = -20
      bounds.maxX = 20
      bounds.minY = -20
      bounds.maxY = 20
    }

    const width = (bounds.maxX - bounds.minX + padding * 2) * SYMBOL_SCALE
    const height = (bounds.maxY - bounds.minY + padding * 2) * SYMBOL_SCALE

    // Transform to SVG coordinates (flip Y)
    const viewBox = `${(bounds.minX - padding) * SYMBOL_SCALE} ${(-bounds.maxY - padding) * SYMBOL_SCALE} ${width} ${height}`

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" style="background-color: ${SYMBOL_COLORS.background}">
  <g transform="scale(${SYMBOL_SCALE}, ${-SYMBOL_SCALE})">
    ${elements.join('\n    ')}
  </g>
</svg>`
  } catch (error) {
    return createErrorSvg(`Parse error: ${error}`)
  }
}

/**
 * Render symbol rectangle
 */
function renderSymbolRectangle(rect: SExpr[], bounds: BoundingBox): string {
  const start = getPoint(rect, 'start')
  const end = getPoint(rect, 'end')
  if (!start || !end) return ''

  const stroke = getStroke(rect)
  const fillType = getFillType(rect)
  const fill = fillType === 'background' ? SYMBOL_COLORS.bodyFill : 'none'

  updateBounds(bounds, start.x, start.y)
  updateBounds(bounds, end.x, end.y)

  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const w = Math.abs(end.x - start.x)
  const h = Math.abs(end.y - start.y)

  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${SYMBOL_COLORS.body}" stroke-width="${stroke?.width ?? 0.254}"/>`
}

/**
 * Render symbol polyline
 */
function renderSymbolPolyline(polyline: SExpr[], bounds: BoundingBox): string {
  const points = getPoints(polyline)
  if (points.length < 2) return ''

  const stroke = getStroke(polyline)
  const fillType = getFillType(polyline)
  const fill = fillType === 'background' ? SYMBOL_COLORS.bodyFill : 'none'

  const pointsStr = points.map(p => {
    updateBounds(bounds, p.x, p.y)
    return `${p.x},${p.y}`
  }).join(' ')

  return `<polyline points="${pointsStr}" fill="${fill}" stroke="${SYMBOL_COLORS.body}" stroke-width="${stroke?.width ?? 0.254}" stroke-linecap="round" stroke-linejoin="round"/>`
}

/**
 * Render symbol circle
 */
function renderSymbolCircle(circle: SExpr[], bounds: BoundingBox): string {
  const center = getPoint(circle, 'center')
  const radius = getNumericAttr(circle, 'radius')
  if (!center || radius === undefined) return ''

  const stroke = getStroke(circle)
  const fillType = getFillType(circle)
  const fill = fillType === 'background' ? SYMBOL_COLORS.bodyFill : 'none'

  updateBounds(bounds, center.x - radius, center.y - radius)
  updateBounds(bounds, center.x + radius, center.y + radius)

  return `<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="${fill}" stroke="${SYMBOL_COLORS.body}" stroke-width="${stroke?.width ?? 0.254}"/>`
}

/**
 * Render symbol arc
 */
function renderSymbolArc(arc: SExpr[], bounds: BoundingBox): string {
  const start = getPoint(arc, 'start')
  const mid = getPoint(arc, 'mid')
  const end = getPoint(arc, 'end')
  if (!start || !mid || !end) return ''

  const stroke = getStroke(arc)

  updateBounds(bounds, start.x, start.y)
  updateBounds(bounds, mid.x, mid.y)
  updateBounds(bounds, end.x, end.y)

  // Calculate arc from three points
  const arcPath = calculateArcPath(start, mid, end)

  return `<path d="${arcPath}" fill="none" stroke="${SYMBOL_COLORS.body}" stroke-width="${stroke?.width ?? 0.254}" stroke-linecap="round"/>`
}

/**
 * Calculate SVG arc path from start, mid, end points
 */
function calculateArcPath(
  start: { x: number; y: number },
  mid: { x: number; y: number },
  end: { x: number; y: number }
): string {
  // Find circle center from three points
  const ax = start.x, ay = start.y
  const bx = mid.x, by = mid.y
  const cx = end.x, cy = end.y

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 0.0001) {
    // Points are collinear, draw a line
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d

  const radius = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2)

  // Determine sweep direction using cross product
  const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const sweepFlag = cross > 0 ? 0 : 1
  const largeArcFlag = 0 // Always use small arc for 3-point arcs

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`
}

/**
 * Render symbol pin
 */
function renderSymbolPin(pin: SExpr[], bounds: BoundingBox): string {
  const at = getPointWithRotation(pin, 'at')
  const length = getNumericAttr(pin, 'length') ?? 2.54
  if (!at) return ''

  // Get pin name and number
  const nameChild = findChild(pin, 'name')
  const numberChild = findChild(pin, 'number')
  const pinName = nameChild && nameChild.length >= 2 && isAtom(nameChild[1]) ? nameChild[1] : ''
  const pinNumber = numberChild && numberChild.length >= 2 && isAtom(numberChild[1]) ? numberChild[1] : ''

  // Calculate pin endpoint based on rotation
  const rotation = at.rotation ?? 0
  const radians = (rotation * Math.PI) / 180
  const endX = at.x + length * Math.cos(radians)
  const endY = at.y + length * Math.sin(radians)

  updateBounds(bounds, at.x, at.y)
  updateBounds(bounds, endX, endY)

  const elements: string[] = []

  // Pin line
  elements.push(`<line x1="${at.x}" y1="${at.y}" x2="${endX}" y2="${endY}" stroke="${SYMBOL_COLORS.pin}" stroke-width="0.254"/>`)

  // Pin dot at connection point
  elements.push(`<circle cx="${at.x}" cy="${at.y}" r="0.3" fill="${SYMBOL_COLORS.pin}"/>`)

  // Pin name (positioned beyond the pin end)
  if (pinName && pinName !== '~') {
    const textOffset = 0.5
    let textX = endX
    let textY = endY
    let anchor = 'start'
    let baseline = 'middle'

    // Position text based on pin direction
    if (rotation === 0) {
      textX = endX + textOffset
      anchor = 'start'
    } else if (rotation === 180) {
      textX = endX - textOffset
      anchor = 'end'
    } else if (rotation === 90) {
      textY = endY + textOffset
      baseline = 'hanging'
      anchor = 'middle'
    } else if (rotation === 270) {
      textY = endY - textOffset
      baseline = 'alphabetic'
      anchor = 'middle'
    }

    // For rotated text, we need to flip Y back since we're in a flipped coordinate system
    elements.push(`<text x="${textX}" y="${textY}" fill="${SYMBOL_COLORS.pinText}" font-size="1" font-family="sans-serif" text-anchor="${anchor}" dominant-baseline="${baseline}" transform="scale(1,-1) translate(0,${-2 * textY})">${escapeXml(pinName)}</text>`)
  }

  // Pin number (positioned between pin start and end)
  if (pinNumber) {
    const midX = (at.x + endX) / 2
    const midY = (at.y + endY) / 2
    const offsetY = rotation === 0 || rotation === 180 ? 0.8 : 0

    elements.push(`<text x="${midX}" y="${midY + offsetY}" fill="${SYMBOL_COLORS.pinText}" font-size="0.8" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" transform="scale(1,-1) translate(0,${-2 * (midY + offsetY)})">${escapeXml(pinNumber)}</text>`)
  }

  return elements.join('\n')
}

/**
 * Render KiCad footprint S-expression to SVG
 */
export function renderFootprintSvg(sexpr: string): string {
  if (!sexpr || sexpr.trim() === '') {
    return createErrorSvg('No footprint data')
  }

  try {
    const parsed = parseSExpr(sexpr)
    if (!isList(parsed) || getTag(parsed) !== 'footprint') {
      return createErrorSvg('Invalid footprint format')
    }

    const elements: string[] = []
    const bounds: BoundingBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

    // Render pads first (bottom layer)
    for (const pad of findChildren(parsed, 'pad')) {
      const svg = renderFootprintPad(pad, bounds)
      if (svg) elements.push(svg)
    }

    // Render lines
    for (const line of findChildren(parsed, 'fp_line')) {
      const svg = renderFootprintLine(line, bounds)
      if (svg) elements.push(svg)
    }

    // Render circles
    for (const circle of findChildren(parsed, 'fp_circle')) {
      const svg = renderFootprintCircle(circle, bounds)
      if (svg) elements.push(svg)
    }

    // Render arcs
    for (const arc of findChildren(parsed, 'fp_arc')) {
      const svg = renderFootprintArc(arc, bounds)
      if (svg) elements.push(svg)
    }

    // Render rectangles
    for (const rect of findChildren(parsed, 'fp_rect')) {
      const svg = renderFootprintRect(rect, bounds)
      if (svg) elements.push(svg)
    }

    // Render polygons (SOLIDREGION)
    for (const poly of findChildren(parsed, 'fp_poly')) {
      const svg = renderFootprintPoly(poly, bounds)
      if (svg) elements.push(svg)
    }

    // Render gr_* elements (graphics primitives that may appear in footprints)
    for (const line of findChildren(parsed, 'gr_line')) {
      const svg = renderFootprintLine(line, bounds)
      if (svg) elements.push(svg)
    }
    for (const circle of findChildren(parsed, 'gr_circle')) {
      const svg = renderFootprintCircle(circle, bounds)
      if (svg) elements.push(svg)
    }
    for (const arc of findChildren(parsed, 'gr_arc')) {
      const svg = renderFootprintArc(arc, bounds)
      if (svg) elements.push(svg)
    }
    for (const rect of findChildren(parsed, 'gr_rect')) {
      const svg = renderFootprintRect(rect, bounds)
      if (svg) elements.push(svg)
    }
    for (const poly of findChildren(parsed, 'gr_poly')) {
      const svg = renderFootprintPoly(poly, bounds)
      if (svg) elements.push(svg)
    }

    // Render text (silkscreen only)
    for (const text of findChildren(parsed, 'fp_text')) {
      const svg = renderFootprintText(text, bounds)
      if (svg) elements.push(svg)
    }

    // Add padding to bounds
    const padding = 1
    if (!isFinite(bounds.minX)) {
      bounds.minX = -5
      bounds.maxX = 5
      bounds.minY = -5
      bounds.maxY = 5
    }

    // ViewBox in mm coordinates - browser scales to fit container
    const width = bounds.maxX - bounds.minX + padding * 2
    const height = bounds.maxY - bounds.minY + padding * 2
    const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" style="background-color: ${FOOTPRINT_COLORS.background}">
  <g>
    ${elements.join('\n    ')}
  </g>
</svg>`
  } catch (error) {
    return createErrorSvg(`Parse error: ${error}`)
  }
}

/**
 * Get color for a footprint layer (KiCad default theme)
 */
function getLayerColor(layer: string): string {
  // Copper layers
  if (layer.includes('F.Cu')) return FOOTPRINT_COLORS.fCu
  if (layer.includes('B.Cu')) return FOOTPRINT_COLORS.bCu
  if (/In\d+\.Cu/.test(layer)) return FOOTPRINT_COLORS.in1Cu
  // Silkscreen
  if (layer.includes('F.SilkS')) return FOOTPRINT_COLORS.fSilkS
  if (layer.includes('B.SilkS')) return FOOTPRINT_COLORS.bSilkS
  // Solder mask
  if (layer.includes('F.Mask')) return FOOTPRINT_COLORS.fMask
  if (layer.includes('B.Mask')) return FOOTPRINT_COLORS.bMask
  // Paste
  if (layer.includes('F.Paste')) return FOOTPRINT_COLORS.fPaste
  if (layer.includes('B.Paste')) return FOOTPRINT_COLORS.bPaste
  // Fabrication
  if (layer.includes('F.Fab')) return FOOTPRINT_COLORS.fFab
  if (layer.includes('B.Fab')) return FOOTPRINT_COLORS.bFab
  // Courtyard
  if (layer.includes('F.CrtYd')) return FOOTPRINT_COLORS.fCrtYd
  if (layer.includes('B.CrtYd')) return FOOTPRINT_COLORS.bCrtYd
  // Other layers
  if (layer.includes('Edge.Cuts')) return FOOTPRINT_COLORS.edgeCuts
  if (layer.includes('Dwgs.User')) return FOOTPRINT_COLORS.dwgsUser
  if (layer.includes('Cmts.User')) return FOOTPRINT_COLORS.cmtsUser
  if (layer.includes('Margin')) return FOOTPRINT_COLORS.margin
  return FOOTPRINT_COLORS.fSilkS // Default fallback
}

/**
 * Render footprint pad
 */
function renderFootprintPad(pad: SExpr[], bounds: BoundingBox): string {
  // (pad "number" type shape (at x y [rot]) (size w h) (layers ...) ...)
  if (!isList(pad) || pad.length < 4) return ''

  const padNumber = isAtom(pad[1]) ? pad[1] : ''
  const padType = isAtom(pad[2]) ? pad[2] : '' // smd, thru_hole, np_thru_hole
  const padShape = isAtom(pad[3]) ? pad[3] : '' // rect, roundrect, circle, oval, custom

  const at = getPointWithRotation(pad, 'at')
  const size = getSize(pad)
  if (!at || !size) return ''

  updateBounds(bounds, at.x - size.width / 2, at.y - size.height / 2)
  updateBounds(bounds, at.x + size.width / 2, at.y + size.height / 2)

  const elements: string[] = []
  const layers = getLayers(pad)

  // Use KiCad-style pad colors: yellow for THT, red/green for SMD
  let color: string
  if (padType === 'thru_hole' || padType === 'np_thru_hole') {
    color = FOOTPRINT_COLORS.padThruHole // Yellow for through-hole
  } else if (layers.some(l => l.includes('B.'))) {
    color = FOOTPRINT_COLORS.padBack // Green for back SMD
  } else {
    color = FOOTPRINT_COLORS.padFront // Red for front SMD
  }

  // Render pad shape
  const rotation = at.rotation ?? 0
  const transform = rotation !== 0 ? ` transform="rotate(${rotation}, ${at.x}, ${at.y})"` : ''

  if (padShape === 'circle') {
    const r = Math.min(size.width, size.height) / 2
    elements.push(`<circle cx="${at.x}" cy="${at.y}" r="${r}" fill="${color}"${transform}/>`)
  } else if (padShape === 'oval') {
    const rx = size.width / 2
    const ry = size.height / 2
    elements.push(`<ellipse cx="${at.x}" cy="${at.y}" rx="${rx}" ry="${ry}" fill="${color}"${transform}/>`)
  } else if (padShape === 'roundrect') {
    const rratio = getNumericAttr(pad, 'roundrect_rratio') ?? 0.25
    const rx = Math.min(size.width, size.height) * rratio / 2
    const x = at.x - size.width / 2
    const y = at.y - size.height / 2
    elements.push(`<rect x="${x}" y="${y}" width="${size.width}" height="${size.height}" rx="${rx}" fill="${color}"${transform}/>`)
  } else if (padShape === 'custom') {
    // Render custom pad primitives
    const primitives = findChild(pad, 'primitives')
    if (primitives) {
      for (const prim of findChildren(primitives, 'gr_poly')) {
        const points = getPoints(prim)
        if (points.length >= 3) {
          // Translate points relative to pad center and update bounds
          const polyStr = points.map(p => {
            const absX = at.x + p.x
            const absY = at.y + p.y
            updateBounds(bounds, absX, absY)
            return `${absX},${absY}`
          }).join(' ')
          elements.push(`<polygon points="${polyStr}" fill="${color}"${transform}/>`)
        }
      }
    }
    // Fallback to rect if no primitives
    if (elements.length === 0) {
      const x = at.x - size.width / 2
      const y = at.y - size.height / 2
      elements.push(`<rect x="${x}" y="${y}" width="${size.width}" height="${size.height}" fill="${color}"${transform}/>`)
    }
  } else {
    // Default to rect
    const x = at.x - size.width / 2
    const y = at.y - size.height / 2
    elements.push(`<rect x="${x}" y="${y}" width="${size.width}" height="${size.height}" fill="${color}"${transform}/>`)
  }

  // Render drill hole for THT pads
  if (padType === 'thru_hole' || padType === 'np_thru_hole') {
    const drill = findChild(pad, 'drill')
    if (drill && drill.length >= 2) {
      // (drill size) or (drill oval w h)
      const isOval = isAtom(drill[1]) && drill[1] === 'oval'
      if (isOval && drill.length >= 4) {
        const dw = parseFloat(isAtom(drill[2]) ? drill[2] : '0')
        const dh = parseFloat(isAtom(drill[3]) ? drill[3] : '0')
        elements.push(`<ellipse cx="${at.x}" cy="${at.y}" rx="${dw / 2}" ry="${dh / 2}" fill="${FOOTPRINT_COLORS.drill}"${transform}/>`)
      } else {
        const drillSize = parseFloat(isAtom(drill[1]) ? drill[1] : '0')
        elements.push(`<circle cx="${at.x}" cy="${at.y}" r="${drillSize / 2}" fill="${FOOTPRINT_COLORS.drill}"/>`)
      }
    }
  }

  // Render pad number
  if (padNumber) {
    const fontSize = Math.min(size.width, size.height) * 0.5
    elements.push(`<text x="${at.x}" y="${at.y}" fill="#FFFFFF" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${escapeXml(padNumber)}</text>`)
  }

  return elements.join('\n')
}

/**
 * Render footprint line
 */
function renderFootprintLine(line: SExpr[], bounds: BoundingBox): string {
  const start = getPoint(line, 'start')
  const end = getPoint(line, 'end')
  if (!start || !end) return ''

  const stroke = getStroke(line)
  const layers = getLayers(line)
  const layer = layers[0] ?? 'F.SilkS'

  // Skip courtyard for cleaner preview
  if (layer.includes('CrtYd')) return ''

  const color = getLayerColor(layer)

  updateBounds(bounds, start.x, start.y)
  updateBounds(bounds, end.x, end.y)

  return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${color}" stroke-width="${stroke?.width ?? 0.15}" stroke-linecap="round"/>`
}

/**
 * Render footprint circle
 */
function renderFootprintCircle(circle: SExpr[], bounds: BoundingBox): string {
  const center = getPoint(circle, 'center')
  const end = getPoint(circle, 'end')
  if (!center || !end) return ''

  // KiCad defines circles by center and a point on the circumference
  const radius = Math.sqrt((end.x - center.x) ** 2 + (end.y - center.y) ** 2)

  const stroke = getStroke(circle)
  const layers = getLayers(circle)
  const layer = layers[0] ?? 'F.SilkS'

  // Skip courtyard
  if (layer.includes('CrtYd')) return ''

  const color = getLayerColor(layer)

  updateBounds(bounds, center.x - radius, center.y - radius)
  updateBounds(bounds, center.x + radius, center.y + radius)

  return `<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke?.width ?? 0.15}"/>`
}

/**
 * Render footprint arc
 */
function renderFootprintArc(arc: SExpr[], bounds: BoundingBox): string {
  const start = getPoint(arc, 'start')
  const mid = getPoint(arc, 'mid')
  const end = getPoint(arc, 'end')
  if (!start || !mid || !end) return ''

  const stroke = getStroke(arc)
  const layers = getLayers(arc)
  const layer = layers[0] ?? 'F.SilkS'

  // Skip courtyard
  if (layer.includes('CrtYd')) return ''

  const color = getLayerColor(layer)

  updateBounds(bounds, start.x, start.y)
  updateBounds(bounds, mid.x, mid.y)
  updateBounds(bounds, end.x, end.y)

  const arcPath = calculateArcPath(start, mid, end)

  return `<path d="${arcPath}" fill="none" stroke="${color}" stroke-width="${stroke?.width ?? 0.15}" stroke-linecap="round"/>`
}

/**
 * Render footprint polygon (for SOLIDREGION)
 */
function renderFootprintPoly(poly: SExpr[], bounds: BoundingBox): string {
  // (fp_poly (pts (xy x y) (xy x y) ...) (layer "...") (stroke ...) (fill ...))
  const points = getPoints(poly)
  if (points.length < 3) return ''

  const layers = getLayers(poly)
  const layer = layers[0] ?? 'F.Cu'

  // Skip courtyard for cleaner preview
  if (layer.includes('CrtYd')) return ''

  const color = getLayerColor(layer)
  const stroke = getStroke(poly)
  const fillType = getFillType(poly)
  const fill = fillType === 'solid' || fillType === 'yes' ? color : 'none'

  const pointsStr = points.map(p => {
    updateBounds(bounds, p.x, p.y)
    return `${p.x},${p.y}`
  }).join(' ')

  const strokeWidth = stroke?.width ?? 0
  const strokeAttr = strokeWidth > 0 ? ` stroke="${color}" stroke-width="${strokeWidth}"` : ''

  return `<polygon points="${pointsStr}" fill="${fill}"${strokeAttr}/>`
}

/**
 * Render footprint rectangle
 */
function renderFootprintRect(rect: SExpr[], bounds: BoundingBox): string {
  const start = getPoint(rect, 'start')
  const end = getPoint(rect, 'end')
  if (!start || !end) return ''

  const layers = getLayers(rect)
  const layer = layers[0] ?? 'F.SilkS'

  // Skip courtyard for cleaner preview
  if (layer.includes('CrtYd')) return ''

  const color = getLayerColor(layer)
  const stroke = getStroke(rect)
  const fillType = getFillType(rect)
  const fill = fillType === 'solid' ? color : 'none'

  updateBounds(bounds, start.x, start.y)
  updateBounds(bounds, end.x, end.y)

  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const w = Math.abs(end.x - start.x)
  const h = Math.abs(end.y - start.y)

  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${color}" stroke-width="${stroke?.width ?? 0.15}"/>`
}

/**
 * Render footprint text
 */
function renderFootprintText(text: SExpr[], bounds: BoundingBox): string {
  // (fp_text type "text" (at x y [rot]) (layer "...") (effects ...))
  if (!isList(text) || text.length < 3) return ''

  const textType = isAtom(text[1]) ? text[1] : '' // reference, value, user
  const textContent = isAtom(text[2]) ? text[2] : ''

  // Skip reference and value - they're placeholders
  if (textType === 'reference' || textType === 'value') return ''

  const at = getPointWithRotation(text, 'at')
  if (!at) return ''

  const layers = getLayers(text)
  const layer = layers[0] ?? 'F.SilkS'
  const color = getLayerColor(layer)

  // Get font size from effects
  const effects = findChild(text, 'effects')
  let fontSize = 1
  if (effects) {
    const font = findChild(effects, 'font')
    if (font) {
      const size = getSize(font)
      if (size) fontSize = size.height
    }
  }

  updateBounds(bounds, at.x - 2, at.y - 1)
  updateBounds(bounds, at.x + 2, at.y + 1)

  const rotation = at.rotation ?? 0
  const transform = rotation !== 0 ? ` transform="rotate(${rotation}, ${at.x}, ${at.y})"` : ''

  return `<text x="${at.x}" y="${at.y}" fill="${color}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" dominant-baseline="central"${transform}>${escapeXml(textContent)}</text>`
}

/**
 * Update bounding box with a point
 */
function updateBounds(bounds: BoundingBox, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x)
  bounds.maxX = Math.max(bounds.maxX, x)
  bounds.minY = Math.min(bounds.minY, y)
  bounds.maxY = Math.max(bounds.maxY, y)
}

/**
 * Create error SVG
 */
function createErrorSvg(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="100%" height="100%">
  <rect width="200" height="100" fill="#FFF0F0"/>
  <text x="100" y="50" fill="#CC0000" font-size="12" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${escapeXml(message)}</text>
</svg>`
}
