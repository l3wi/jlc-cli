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
  cmtsUser: '#848484',    // Cmts.User - gray
  margin: '#C200C2',      // Margin - magenta
  // Pads
  padFront: '#840000',    // Front SMD pads - red
  padBack: '#008400',     // Back SMD pads - green
  padThruHole: '#C2C200', // THT pads - yellow
  drill: '#848484',       // Drill holes - gray
}

// Scale factor: KiCad uses mm, we render with pixels per mm
const SYMBOL_SCALE = 10   // pixels per mm for symbols

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
    let parsed = parseSExpr(sexpr)

    // Handle kicad_symbol_lib wrapper - extract the first symbol
    if (isList(parsed) && getTag(parsed) === 'kicad_symbol_lib') {
      const symbols = findChildren(parsed, 'symbol')
      if (symbols.length === 0) {
        return createErrorSvg('No symbol found in library')
      }
      parsed = symbols[0]
    }

    if (!isList(parsed) || getTag(parsed) !== 'symbol') {
      return createErrorSvg('Invalid symbol format')
    }

    const elements: string[] = []
    const bounds: BoundingBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

    // Find all symbol units (graphics and pins)
    const units = findChildren(parsed, 'symbol')
    const pinNames = findChild(parsed, 'pin_names')
    const pinNumbers = findChild(parsed, 'pin_numbers')
    for (const property of findChildren(parsed, 'property')) {
      elements.push(renderText(property, bounds, true))
    }

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
      for (const text of findChildren(unit, 'text')) {
        elements.push(renderText(text, bounds, true))
      }

      // Render pins
      for (const pin of findChildren(unit, 'pin')) {
        const svg = renderSymbolPin(pin, bounds, pinNames, pinNumbers)
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
    return createErrorSvg(`Preview error: ${error}`)
  }
}

/**
 * Resolve KiCad symbol fill modes
 */
function symbolFill(shape: SExpr[]): string {
  const fill = getFillType(shape)
  return fill === 'background' ? SYMBOL_COLORS.bodyFill
    : fill === 'outline' || fill === 'solid' ? SYMBOL_COLORS.body : 'none'
}

function renderSymbolRectangle(rect: SExpr[], bounds: BoundingBox): string {
  const start = getPoint(rect, 'start')
  const end = getPoint(rect, 'end')
  if (!start || !end) return ''
  const width = getStroke(rect)?.width || 0.254
  updateBounds(bounds, start.x, start.y, width / 2)
  updateBounds(bounds, end.x, end.y, width / 2)
  return `<rect x="${Math.min(start.x, end.x)}" y="${Math.min(start.y, end.y)}" width="${Math.abs(end.x - start.x)}" height="${Math.abs(end.y - start.y)}" fill="${symbolFill(rect)}" stroke="${SYMBOL_COLORS.body}" stroke-width="${width}" stroke-linejoin="round"/>`
}

function renderSymbolPolyline(polyline: SExpr[], bounds: BoundingBox): string {
  const points = getPoints(polyline)
  if (points.length < 2) return ''
  const width = getStroke(polyline)?.width || 0.254
  for (const point of points) updateBounds(bounds, point.x, point.y, width / 2)
  return `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="${symbolFill(polyline)}" stroke="${SYMBOL_COLORS.body}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
}

function renderSymbolCircle(circle: SExpr[], bounds: BoundingBox): string {
  const center = getPoint(circle, 'center')
  const radius = getNumericAttr(circle, 'radius')
  if (!center || radius === undefined) return ''
  const width = getStroke(circle)?.width || 0.254
  updateBounds(bounds, center.x, center.y, radius + width / 2)
  return `<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="${symbolFill(circle)}" stroke="${SYMBOL_COLORS.body}" stroke-width="${width}"/>`
}

function renderSymbolArc(arc: SExpr[], bounds: BoundingBox): string {
  const start = getPoint(arc, 'start')
  const mid = getPoint(arc, 'mid')
  const end = getPoint(arc, 'end')
  if (!start || !mid || !end) return ''
  const width = getStroke(arc)?.width || 0.254
  return `<path d="${calculateArcPath(start, mid, end, bounds, width)}" fill="${symbolFill(arc)}" stroke="${SYMBOL_COLORS.body}" stroke-width="${width}" stroke-linecap="round"/>`
}

type Point = { x: number; y: number }
type Placement = Point & { rotation?: number }

// Both SVG and KiCad footprint coordinates are Y-down, but positive KiCad
// rotations are counterclockwise. Symbol geometry is flipped at the root instead.
function footprintPoint(point: Point, at: Placement): Point {
  const angle = -(at.rotation ?? 0) * Math.PI / 180
  return {
    x: at.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: at.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  }
}

function calculateArcPath(start: Point, mid: Point, end: Point, bounds: BoundingBox, width: number): string {
  const bx = mid.x - start.x, by = mid.y - start.y
  const cx = end.x - start.x, cy = end.y - start.y
  const determinant = 2 * (bx * cy - by * cx)
  for (const point of [start, mid, end]) updateBounds(bounds, point.x, point.y, width / 2)
  if (Math.abs(determinant) <= Number.EPSILON * Math.max(bx * bx + by * by, cx * cx + cy * cy) * 16) {
    return `M ${start.x} ${start.y} L ${mid.x} ${mid.y} L ${end.x} ${end.y}`
  }
  const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy
  const ux = (b2 * cy - c2 * by) / determinant
  const uy = (bx * c2 - cx * b2) / determinant
  const center = { x: start.x + ux, y: start.y + uy }
  const radius = Math.hypot(ux, uy)
  const tau = Math.PI * 2
  const positive = (angle: number) => ((angle % tau) + tau) % tau
  const startAngle = Math.atan2(-uy, -ux)
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x)
  const sweep = determinant > 0
  const travel = positive(sweep ? endAngle - startAngle : startAngle - endAngle)
  for (let angle = 0; angle < tau; angle += Math.PI / 2) {
    if (positive(sweep ? angle - startAngle : startAngle - angle) <= travel + 1e-12) {
      updateBounds(bounds, center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle), width / 2)
    }
  }
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${travel > Math.PI ? 1 : 0} ${sweep ? 1 : 0} ${end.x} ${end.y}`
}

function isHidden(expr: SExpr[] | undefined): boolean {
  if (!expr) return false
  const hide = findChild(expr, 'hide')
  return expr.includes('hide') || !!hide && (hide.length === 1 || hide[1] === 'yes')
}

function renderSymbolPin(pin: SExpr[], bounds: BoundingBox, pinNames?: SExpr[], pinNumbers?: SExpr[]): string {
  if (isHidden(pin)) return ''
  const at = getPointWithRotation(pin, 'at')
  if (!at) return ''
  const length = getNumericAttr(pin, 'length') ?? 2.54
  const rotation = ((at.rotation ?? 0) % 360 + 360) % 360
  const angle = rotation * Math.PI / 180
  const direction = { x: Math.cos(angle), y: Math.sin(angle) }
  const end = { x: at.x + length * direction.x, y: at.y + length * direction.y }
  const style = isAtom(pin[2]) ? pin[2] : 'line'
  if (!['line', 'inverted', 'clock', 'inverted_clock'].includes(style)) {
    throw new Error(`Unsupported pin style: ${style}`)
  }
  const inverted = style === 'inverted' || style === 'inverted_clock'
  const clock = style === 'clock' || style === 'inverted_clock'
  const radius = 0.3
  const lineEnd = inverted ? { x: end.x - 2 * radius * direction.x, y: end.y - 2 * radius * direction.y } : end
  updateBounds(bounds, at.x, at.y, 0.127)
  updateBounds(bounds, end.x, end.y, 0.127)
  const elements = [`<line x1="${at.x}" y1="${at.y}" x2="${lineEnd.x}" y2="${lineEnd.y}" stroke="${SYMBOL_COLORS.pin}" stroke-width="0.254"/>`]
  if (inverted) {
    const center = { x: end.x - radius * direction.x, y: end.y - radius * direction.y }
    updateBounds(bounds, center.x, center.y, radius + 0.127)
    elements.push(`<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="none" stroke="${SYMBOL_COLORS.pin}" stroke-width="0.254"/>`)
  }
  if (clock) {
    const points = [
      { x: end.x - direction.y * 0.6, y: end.y + direction.x * 0.6 },
      { x: end.x + direction.x * 0.6, y: end.y + direction.y * 0.6 },
      { x: end.x + direction.y * 0.6, y: end.y - direction.x * 0.6 },
    ]
    for (const point of points) updateBounds(bounds, point.x, point.y, 0.127)
    elements.push(`<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${SYMBOL_COLORS.pin}" stroke-width="0.254" stroke-linejoin="round"/>`)
  }
  const name = findChild(pin, 'name')
  const number = findChild(pin, 'number')
  const offset = pinNames ? getNumericAttr(pinNames, 'offset') ?? 0.508 : 0.508
  // Zero name offset puts the name outside the body, above the pin line.
  const nameAt = offset === 0
    ? { x: (at.x + end.x) / 2 - direction.y * 0.8, y: (at.y + end.y) / 2 + direction.x * 0.8 }
    : { x: end.x + direction.x * offset, y: end.y + direction.y * offset }
  const labelAngle = rotation === 90 || rotation === 270 ? 90 : 0
  if (name && name[1] !== '~' && !isHidden(pinNames)) {
    const justify = offset === 0 ? [] : [['justify', rotation === 180 || rotation === 270 ? 'right' : 'left']]
    const effects = findChild(name, 'effects') ?? ['effects', ['font', ['size', '1.27', '1.27']]]
    elements.push(renderText(['text', name[1], ['at', `${nameAt.x}`, `${nameAt.y}`, `${labelAngle}`], [...effects, ...justify]], bounds, true, SYMBOL_COLORS.pinText))
  }
  if (number && !isHidden(pinNumbers)) {
    const side = offset === 0 ? -1 : 1
    const numberAt = { x: (at.x + end.x) / 2 - direction.y * 0.8 * side, y: (at.y + end.y) / 2 + direction.x * 0.8 * side }
    elements.push(renderText(['text', number[1], ['at', `${numberAt.x}`, `${numberAt.y}`, `${labelAngle}`], findChild(number, 'effects') ?? ['effects', ['font', ['size', '1.27', '1.27']]]], bounds, true, SYMBOL_COLORS.pinText))
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

    const properties = new Map<string, string>()
    for (const property of findChildren(parsed, 'property')) {
      if (isAtom(property[1]) && isAtom(property[2])) properties.set(property[1].toUpperCase(), property[2])
    }
    for (const child of parsed) {
      if (!isList(child)) continue
      const tag = getTag(child) ?? ''
      if (tag === 'fp_text' || tag === 'property') {
        elements.push(renderText(child, bounds, false, undefined, properties))
      } else if (tag.startsWith('fp_') || tag.startsWith('gr_')) {
        elements.push(renderFootprintGraphic(child, bounds))
      } else if (tag === 'zone') {
        elements.push(renderRuleArea(child, bounds))
      }
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
    return createErrorSvg(`Preview error: ${error}`)
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
  const padNumber = isAtom(pad[1]) ? pad[1] : ''
  const padType = isAtom(pad[2]) ? pad[2] : ''
  const padShape = isAtom(pad[3]) ? pad[3] : ''
  const at = getPointWithRotation(pad, 'at')
  const size = getSize(pad)
  if (!at || !size) throw new Error(`Invalid pad geometry: ${padNumber}`)
  if (!['rect', 'roundrect', 'circle', 'oval', 'custom'].includes(padShape)
    || findChild(pad, 'chamfer') || findChild(pad, 'rect_delta')) {
    throw new Error(`Unsupported pad geometry: ${padShape}`)
  }
  const layers = getLayers(pad)
  const color = padType === 'thru_hole' || padType === 'np_thru_hole' ? FOOTPRINT_COLORS.padThruHole
    : layers.includes('B.Cu') && !layers.includes('F.Cu') ? FOOTPRINT_COLORS.padBack : FOOTPRINT_COLORS.padFront
  const drill = findChild(pad, 'drill')
  // The pad position is the drill centre; the drill offset translates copper,
  // including custom primitives and the anchor, before rotating the pad.
  const offset = drill ? getPoint(drill, 'offset') ?? { x: 0, y: 0 } : { x: 0, y: 0 }
  const copperAt = { ...footprintPoint(offset, at), rotation: at.rotation }
  const copperBounds: BoundingBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const elements: string[] = []
  const anchor = padShape === 'custom' ? getAttr(findChild(pad, 'options') ?? [], 'anchor') ?? 'rect' : padShape
  if (!['rect', 'roundrect', 'circle', 'oval'].includes(anchor)) throw new Error(`Unsupported custom anchor: ${anchor}`)
  const radius = anchor === 'oval' ? Math.min(size.width, size.height) / 2
    : anchor === 'roundrect' ? Math.min(size.width, size.height) * (getNumericAttr(pad, 'roundrect_rratio') ?? 0.25) : 0
  if (anchor === 'circle') {
    const r = size.width / 2
    updateBounds(copperBounds, copperAt.x, copperAt.y, r)
    elements.push(`<circle cx="${copperAt.x}" cy="${copperAt.y}" r="${r}" fill="${color}"/>`)
  } else {
    elements.push(renderRoundedRect(size.width, size.height, radius, copperAt, color, copperBounds))
  }
  if (padShape === 'custom') {
    const primitives = findChild(pad, 'primitives')
    for (const primitive of primitives ?? []) {
      if (isList(primitive)) elements.push(renderFootprintGraphic(primitive, copperBounds, copperAt, color))
    }
  }
  updateBounds(bounds, copperBounds.minX, copperBounds.minY)
  updateBounds(bounds, copperBounds.maxX, copperBounds.maxY)
  if (drill) {
    const oval = drill[1] === 'oval'
    const width = Number(oval ? drill[2] : drill[1])
    const height = Number(oval ? drill[3] : drill[1])
    if (!(width > 0 && height > 0)) throw new Error(`Invalid drill geometry: ${padNumber}`)
    elements.push(renderRoundedRect(width, height, Math.min(width, height) / 2, at, FOOTPRINT_COLORS.drill, bounds))
  }
  if (padNumber) {
    const fontSize = (padShape === 'custom'
      ? Math.min(copperBounds.maxX - copperBounds.minX, copperBounds.maxY - copperBounds.minY)
      : Math.min(size.width, size.height)) * 0.5
    const textWidth = padNumber.length * fontSize * 0.7
    updateBounds(bounds, copperAt.x - textWidth / 2, copperAt.y - fontSize * 0.75)
    updateBounds(bounds, copperAt.x + textWidth / 2, copperAt.y + fontSize * 0.75)
    elements.push(`<text x="${copperAt.x}" y="${copperAt.y}" fill="#FFFFFF" font-size="${fontSize}" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${escapeXml(padNumber)}</text>`)
  }
  return `<g data-pad="${escapeXml(padNumber)}">${elements.join('\n')}</g>`
}

function renderRoundedRect(width: number, height: number, radius: number, at: Placement, color: string, bounds: BoundingBox): string {
  const r = Math.min(Math.max(radius, 0), Math.min(width, height) / 2)
  const angle = (at.rotation ?? 0) * Math.PI / 180
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
  // A rounded rectangle is the Minkowski sum of an inner rectangle and a disk.
  const dx = cos * (width / 2 - r) + sin * (height / 2 - r) + r
  const dy = sin * (width / 2 - r) + cos * (height / 2 - r) + r
  updateBounds(bounds, at.x - dx, at.y - dy)
  updateBounds(bounds, at.x + dx, at.y + dy)
  return `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${r}" fill="${color}" transform="translate(${at.x} ${at.y}) rotate(${-(at.rotation ?? 0)})"/>`
}

// Shared by footprint drawings and custom-pad copper; primitive widths in pads
// use (width), whereas footprint drawings use (stroke (width ...)).
function renderFootprintGraphic(shape: SExpr[], bounds: BoundingBox, at: Placement = { x: 0, y: 0 }, copperColor?: string): string {
  const tag = getTag(shape) ?? ''
  const kind = tag.replace(/^(fp|gr)_/, '')
  const color = copperColor ?? getLayerColor(getLayers(shape)[0] ?? 'F.SilkS')
  const width = getStroke(shape)?.width ?? getNumericAttr(shape, 'width') ?? (copperColor ? 0 : 0.15)
  const fillType = getFillType(shape)
  const fill = fillType === 'solid' || fillType === 'yes' ? color : 'none'
  const stroke = `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`
  if (kind === 'line' || kind === 'arc' || kind === 'rect') {
    const localStart = getPoint(shape, 'start'), localEnd = getPoint(shape, 'end')
    if (!localStart || !localEnd) throw new Error(`Invalid ${tag} geometry`)
    const start = footprintPoint(localStart, at), end = footprintPoint(localEnd, at)
    if (kind === 'arc') {
      const mid = getPoint(shape, 'mid')
      if (!mid) throw new Error(`Unsupported ${tag} without midpoint`)
      return `<path d="${calculateArcPath(start, footprintPoint(mid, at), end, bounds, width)}" fill="none" ${stroke}/>`
    }
    if (kind === 'rect') {
      const points = [localStart, { x: localEnd.x, y: localStart.y }, localEnd, { x: localStart.x, y: localEnd.y }].map(p => footprintPoint(p, at))
      for (const point of points) updateBounds(bounds, point.x, point.y, width / 2)
      return `<polygon points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="${fill}" ${stroke}/>`
    }
    updateBounds(bounds, start.x, start.y, width / 2)
    updateBounds(bounds, end.x, end.y, width / 2)
    return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" ${stroke}/>`
  }
  if (kind === 'circle') {
    const center = getPoint(shape, 'center'), end = getPoint(shape, 'end')
    if (!center || !end) throw new Error(`Invalid ${tag} geometry`)
    const radius = Math.hypot(end.x - center.x, end.y - center.y)
    const world = footprintPoint(center, at)
    updateBounds(bounds, world.x, world.y, radius + width / 2)
    return `<circle cx="${world.x}" cy="${world.y}" r="${radius}" fill="${fill}" ${stroke}/>`
  }
  if (kind === 'poly') {
    const points = getPoints(shape).map(p => footprintPoint(p, at))
    if (points.length < 3) throw new Error(`Invalid ${tag} geometry`)
    for (const point of points) updateBounds(bounds, point.x, point.y, width / 2)
    return `<polygon points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="${fill}" ${stroke}/>`
  }
  throw new Error(`Unsupported footprint geometry: ${tag}`)
}

function renderRuleArea(zone: SExpr[], bounds: BoundingBox): string {
  const keepout = findChild(zone, 'keepout')
  if (!keepout) throw new Error('Unsupported footprint copper zone (not a rule area)')
  const restrictions = keepout.filter(isList).filter(rule => rule[1] === 'not_allowed').map(rule => getTag(rule))
  const polygons = findChildren(zone, 'polygon')
  if (polygons.length === 0) throw new Error('Invalid rule area: missing polygon')
  const color = FOOTPRINT_COLORS.margin
  const elements: string[] = []
  for (const polygon of polygons) {
    const points = getPoints(polygon)
    if (points.length < 3) throw new Error('Invalid rule-area polygon')
    for (const point of points) updateBounds(bounds, point.x, point.y, 0.075)
    elements.push(`<polygon points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="0.15" stroke-dasharray="0.4 0.2"/>`)
  }
  return `<g data-rule-area="true"><title>${escapeXml(`Rule area (${getLayers(zone).join(', ')}): ${restrictions.join(', ')} prohibited; outline only, not a copper subtraction`)}</title>${elements.join('')}</g>`
}

function renderText(text: SExpr[], bounds: BoundingBox, symbol: boolean, color?: string, properties?: Map<string, string>): string {
  const effects = findChild(text, 'effects')
  if (isHidden(text) || isHidden(effects)) return ''
  const at = getPointWithRotation(text, 'at')
  const contentNode = text[getTag(text) === 'text' ? 1 : 2]
  if (!at || !isAtom(contentNode) || !contentNode) return ''
  const content = contentNode.replace(/\$\{([^}]+)\}/g, (match, key: string) => properties?.get(key.toUpperCase()) ?? match)
  const font = effects ? findChild(effects, 'font') : undefined
  const size = font ? getSize(font) : undefined
  const height = size?.height ?? 1.27
  const charWidth = (size?.width ?? height) * 0.7
  const justify = effects ? findChild(effects, 'justify') : undefined
  const anchor = justify?.includes('left') ? 'start' : justify?.includes('right') ? 'end' : 'middle'
  const mirrored = justify?.includes('mirror') ? -1 : 1
  const lines = content.split('\n')
  const lineHeight = height * 1.5
  const totalHeight = height + (lines.length - 1) * lineHeight
  const top = justify?.includes('top') ? 0 : justify?.includes('bottom') ? -totalHeight : -totalHeight / 2
  const rotation = symbol ? at.rotation ?? 0 : -(at.rotation ?? 0)
  const angle = rotation * Math.PI / 180
  const spans: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const width = lines[i].length * charWidth
    const left = anchor === 'start' ? 0 : anchor === 'end' ? -width : -width / 2
    const y = top + height / 2 + i * lineHeight
    // Include glyph ascenders/descenders and rotate the actual label envelope.
    for (const x of [left, left + width]) for (const edgeY of [y - height * 0.75, y + height * 0.75]) {
      const localX = x * mirrored, localY = edgeY * (symbol ? -1 : 1)
      updateBounds(bounds, at.x + localX * Math.cos(angle) - localY * Math.sin(angle), at.y + localX * Math.sin(angle) + localY * Math.cos(angle))
    }
    spans.push(`<tspan x="0" y="${y}"${width > 0 ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : ''}>${escapeXml(lines[i])}</tspan>`)
  }
  const fill = color ?? (symbol ? SYMBOL_COLORS.text : getLayerColor(getLayers(text)[0] ?? 'F.SilkS'))
  const style = `${font?.includes('bold') || getAttr(font ?? [], 'bold') === 'yes' ? ' font-weight="bold"' : ''}${font?.includes('italic') || getAttr(font ?? [], 'italic') === 'yes' ? ' font-style="italic"' : ''}`
  return `<text fill="${fill}" font-size="${height}" font-family="sans-serif" text-anchor="${anchor}" dominant-baseline="central"${style} transform="translate(${at.x} ${at.y}) rotate(${rotation}) scale(${mirrored} ${symbol ? -1 : 1})">${spans.join('')}</text>`
}

/**
 * Update bounding box with a point
 */
function updateBounds(bounds: BoundingBox, x: number, y: number, radius = 0): void {
  bounds.minX = Math.min(bounds.minX, x - radius)
  bounds.maxX = Math.max(bounds.maxX, x + radius)
  bounds.minY = Math.min(bounds.minY, y - radius)
  bounds.maxY = Math.max(bounds.maxY, y + radius)
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
