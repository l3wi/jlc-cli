/**
 * S-Expression Parser for KiCad format
 * Parses KiCad symbol and footprint S-expressions for browser-side rendering
 */

export type SExpr = string | SExpr[]

/**
 * Tokenize S-expression input into tokens
 * Handles parentheses, quoted strings, and atoms
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < input.length) {
    const char = input[i]

    // Skip whitespace
    if (/\s/.test(char)) {
      i++
      continue
    }

    // Opening/closing parens
    if (char === '(' || char === ')') {
      tokens.push(char)
      i++
      continue
    }

    // Quoted string
    if (char === '"') {
      let str = ''
      i++ // skip opening quote
      while (i < input.length) {
        if (input[i] === '\\' && i + 1 < input.length) {
          // Escape sequence
          str += input[i + 1]
          i += 2
        } else if (input[i] === '"') {
          i++ // skip closing quote
          break
        } else {
          str += input[i]
          i++
        }
      }
      tokens.push(`"${str}"`)
      continue
    }

    // Atom (unquoted token)
    let atom = ''
    while (i < input.length && !/[\s()]/.test(input[i])) {
      atom += input[i]
      i++
    }
    if (atom) {
      tokens.push(atom)
    }
  }

  return tokens
}

/**
 * Parse tokens into nested S-expression structure
 */
function parseTokens(tokens: string[]): { expr: SExpr; remaining: string[] } {
  if (tokens.length === 0) {
    return { expr: [], remaining: [] }
  }

  const token = tokens[0]

  if (token === '(') {
    // Start of list
    const list: SExpr[] = []
    let rest = tokens.slice(1)

    while (rest.length > 0 && rest[0] !== ')') {
      const { expr, remaining } = parseTokens(rest)
      list.push(expr)
      rest = remaining
    }

    // Skip closing paren
    if (rest[0] === ')') {
      rest = rest.slice(1)
    }

    return { expr: list, remaining: rest }
  }

  if (token === ')') {
    // Unexpected closing paren - return empty and let caller handle
    return { expr: [], remaining: tokens.slice(1) }
  }

  // Atom or quoted string
  let value = token
  // Strip quotes from quoted strings for easier access
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
  }

  return { expr: value, remaining: tokens.slice(1) }
}

/**
 * Parse S-expression string into nested structure
 */
export function parseSExpr(input: string): SExpr {
  const tokens = tokenize(input)
  const { expr } = parseTokens(tokens)
  return expr
}

/**
 * Check if expression is a list
 */
export function isList(expr: SExpr): expr is SExpr[] {
  return Array.isArray(expr)
}

/**
 * Check if expression is an atom (string)
 */
export function isAtom(expr: SExpr): expr is string {
  return typeof expr === 'string'
}

/**
 * Get the first element of a list (the tag/type)
 */
export function getTag(expr: SExpr): string | undefined {
  if (isList(expr) && expr.length > 0 && isAtom(expr[0])) {
    return expr[0]
  }
  return undefined
}

/**
 * Find a child element by its tag name
 * Returns first match or undefined
 */
export function findChild(expr: SExpr, tag: string): SExpr[] | undefined {
  if (!isList(expr)) return undefined

  for (const child of expr) {
    if (isList(child) && getTag(child) === tag) {
      return child
    }
  }
  return undefined
}

/**
 * Find all child elements with a given tag
 */
export function findChildren(expr: SExpr, tag: string): SExpr[][] {
  if (!isList(expr)) return []

  const results: SExpr[][] = []
  for (const child of expr) {
    if (isList(child) && getTag(child) === tag) {
      results.push(child)
    }
  }
  return results
}

/**
 * Get a simple attribute value: (tag value) -> value
 */
export function getAttr(expr: SExpr, tag: string): string | undefined {
  const child = findChild(expr, tag)
  if (child && child.length >= 2 && isAtom(child[1])) {
    return child[1]
  }
  return undefined
}

/**
 * Get a numeric attribute value
 */
export function getNumericAttr(expr: SExpr, tag: string): number | undefined {
  const value = getAttr(expr, tag)
  if (value !== undefined) {
    const num = parseFloat(value)
    if (!isNaN(num)) return num
  }
  return undefined
}

/**
 * Get a point from (tag x y) format
 */
export function getPoint(
  expr: SExpr,
  tag: string
): { x: number; y: number } | undefined {
  const child = findChild(expr, tag)
  if (child && child.length >= 3) {
    const x = parseFloat(isAtom(child[1]) ? child[1] : '')
    const y = parseFloat(isAtom(child[2]) ? child[2] : '')
    if (!isNaN(x) && !isNaN(y)) {
      return { x, y }
    }
  }
  return undefined
}

/**
 * Get point with optional rotation: (tag x y [rotation])
 */
export function getPointWithRotation(
  expr: SExpr,
  tag: string
): { x: number; y: number; rotation?: number } | undefined {
  const child = findChild(expr, tag)
  if (child && child.length >= 3) {
    const x = parseFloat(isAtom(child[1]) ? child[1] : '')
    const y = parseFloat(isAtom(child[2]) ? child[2] : '')
    if (!isNaN(x) && !isNaN(y)) {
      const result: { x: number; y: number; rotation?: number } = { x, y }
      if (child.length >= 4 && isAtom(child[3])) {
        const rotation = parseFloat(child[3])
        if (!isNaN(rotation)) {
          result.rotation = rotation
        }
      }
      return result
    }
  }
  return undefined
}

/**
 * Get size from (size w h) format
 */
export function getSize(
  expr: SExpr
): { width: number; height: number } | undefined {
  const child = findChild(expr, 'size')
  if (child && child.length >= 3) {
    const width = parseFloat(isAtom(child[1]) ? child[1] : '')
    const height = parseFloat(isAtom(child[2]) ? child[2] : '')
    if (!isNaN(width) && !isNaN(height)) {
      return { width, height }
    }
  }
  return undefined
}

/**
 * Get stroke properties from (stroke ...) element
 */
export function getStroke(
  expr: SExpr
): { width: number; type: string } | undefined {
  const stroke = findChild(expr, 'stroke')
  if (!stroke) return undefined

  const width = getNumericAttr(stroke, 'width') ?? 0.254
  const type = getAttr(stroke, 'type') ?? 'default'

  return { width, type }
}

/**
 * Get fill type from (fill (type ...)) element
 */
export function getFillType(expr: SExpr): string | undefined {
  const fill = findChild(expr, 'fill')
  if (!fill) return undefined
  return getAttr(fill, 'type')
}

/**
 * Get all XY points from (pts (xy x y) (xy x y) ...) structure
 */
export function getPoints(expr: SExpr): Array<{ x: number; y: number }> {
  const pts = findChild(expr, 'pts')
  if (!pts) return []

  const points: Array<{ x: number; y: number }> = []
  for (const child of pts) {
    if (isList(child) && getTag(child) === 'xy' && child.length >= 3) {
      const x = parseFloat(isAtom(child[1]) ? child[1] : '')
      const y = parseFloat(isAtom(child[2]) ? child[2] : '')
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y })
      }
    }
  }

  return points
}

/**
 * Get layers from (layers "Layer1" "Layer2" ...) or (layer "Layer")
 */
export function getLayers(expr: SExpr): string[] {
  // Check for single layer
  const layer = getAttr(expr, 'layer')
  if (layer) return [layer]

  // Check for multiple layers
  const layers = findChild(expr, 'layers')
  if (!layers) return []

  const result: string[] = []
  for (let i = 1; i < layers.length; i++) {
    const item = layers[i]
    if (isAtom(item)) {
      result.push(item)
    }
  }
  return result
}
