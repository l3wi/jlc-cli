/**
 * Compare symbol pin identity, connection layout, direction and declared electrical
 * semantics. Body graphics, pin lengths and graphical styles are outside this scope.
 */
import type {
  PinInfo, SymbolData, SymbolComparisonResult, PinDiff, ComparisonOptions, PinElectrical,
} from './types.js';
import { DEFAULT_COMPARISON_OPTIONS } from './types.js';
import { childExpressions } from '../utils/sexpr.js';
import { parseSExpr, findChild, findChildren, getTag, type SExpr } from '../browser/sexpr-parser.js';
import { parseReferenceSvg, type ReferenceSvgNode } from './svg-parser.js';
import { flattenSvgPath } from '../converter/svg-path.js';
import { associatePinNamesFromTexts } from '../parsers/easyeda-shapes.js';

const EE_TO_MM = 0.254;
const normalizeAngle = (angle: number): number => ((angle % 360) + 360) % 360;

function finite(value: string | undefined): number {
  return value === undefined || value.trim() === '' ? NaN : Number(value);
}

const ELECTRICAL_TYPES: Record<string, PinElectrical> = {
  input: 'input', output: 'output', bidirectional: 'bidirectional', tri_state: 'tri_state',
  passive: 'passive', free: 'free', unspecified: 'unspecified', power_in: 'power_in',
  power_out: 'power_out', open_collector: 'open_collector', open_emitter: 'open_emitter',
  no_connect: 'no_connect',
};
const SOURCE_ELECTRICAL_TYPES: Record<string, PinElectrical> = {
  ...ELECTRICAL_TYPES,
  '0': 'unspecified', '1': 'input', '2': 'output', '3': 'bidirectional', '4': 'power_in',
  '5': 'power_out', '6': 'open_collector', '7': 'open_emitter', '8': 'passive', '9': 'no_connect',
  bi: 'bidirectional', tristate: 'tri_state', power: 'power_in', unconnected: 'no_connect', nc: 'no_connect',
};
function electricalType(value: string | undefined, source = false): PinElectrical {
  const mapping = source ? SOURCE_ELECTRICAL_TYPES : ELECTRICAL_TYPES;
  const key = value?.trim().toLowerCase() ?? '';
  return Object.hasOwn(mapping, key) ? mapping[key] : 'unknown';
}

function symbolData(pins: PinInfo[], issues: string[]): SymbolData {
  const points = pins.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    pins, issues,
    bounds: points.length ? {
      minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
      minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)),
    } : { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  };
}

/** Some vendor pins omit the zero angle; require a straight connection path as evidence. */
function sourceDirection(node: ReferenceSvgNode, x: number, y: number): number {
  const declared = node.attrs.c_rotation;
  if (declared?.trim()) return normalizeAngle(180 + finite(declared));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return NaN;
  let direction = NaN;
  for (const child of node.children) {
    if (child.tag !== 'path' || child.attrs.display === 'none' || child.attrs.transform ||
      /display\s*:\s*none/i.test(child.attrs.style ?? '')) continue;
    let paths;
    try { paths = flattenSvgPath(child.attrs.d ?? '', 0.005 / EE_TO_MM); } catch { return NaN; }
    if (paths.length !== 1 || paths[0].closed || paths[0].points.length < 2) continue;
    const points = paths[0].points;
    if (Math.hypot(points[0].x - x, points[0].y - y) > 1e-6) continue;
    const end = points[points.length - 1], dx = end.x - x, dy = end.y - y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6 || points.some(point => {
      const along = ((point.x - x) * dx + (point.y - y) * dy) / length;
      return Math.abs((point.x - x) * dy - (point.y - y) * dx) / length > 1e-6 ||
        along < -1e-6 || along > length + 1e-6;
    })) return NaN;
    if (Number.isFinite(direction)) return NaN; // More than one candidate is ambiguous.
    direction = normalizeAngle(Math.atan2(-dy, dx) * 180 / Math.PI);
  }
  return direction;
}


/** Coordinates retain the source translation until comparison; no source-side centering. */
export function extractFromReferenceSVG(svg: string): SymbolData {
  const pins: PinInfo[] = [], issues: string[] = [];
  const annotations: Array<{ text: string; isPinPart: boolean }> = [];
  try {
    function visit(node: ReferenceSvgNode, transformed = false): void {
      transformed ||= !!node.attrs.transform?.trim();
      if (node.attrs.c_partid === 'part_pin') {
        const number = node.attrs.c_spicepin ?? node.attrs.number ?? '';
        const labels = node.children.filter(child => child.tag === 'text');
        // EasyEDA emits name then number labels. A lone label is ambiguous: it
        // may be the surviving number, especially for numerically named pins.
        const name = node.attrs.name ?? (labels.length === 2 ? labels[0].text.trim() : undefined);
        if (name === undefined) issues.push(`Pin ${number}: name metadata unavailable`);
        if (transformed) issues.push(`Pin ${number}: transformed SVG pin coordinates are unsupported`);
        const origin = node.attrs.c_origin?.split(',') ?? [];
        if (origin.length !== 2) issues.push(`Pin ${number}: connection origin unavailable`);
        pins.push({
          number, name: name ?? '', x: finite(origin[0]) * EE_TO_MM, y: -finite(origin[1]) * EE_TO_MM,
          rotation: sourceDirection(node, finite(origin[0]), finite(origin[1])),
          // c_etype="pinpart" describes the SVG object, not its electrical role.
          electrical: electricalType(node.attrs.c_elec ?? node.attrs.c_etype, true),
        });
        return;
      }
      if (node.attrs.c_partid === 'part_annotation' && node.attrs.c_etype === 'pinpart') {
        for (const child of node.children) {
          if (child.tag === 'text') annotations.push({ text: child.text, isPinPart: true });
        }
      }
      for (const child of node.children) visit(child, transformed);
    }
    visit(parseReferenceSvg(svg));
    associatePinNamesFromTexts(pins, annotations);
  } catch (error) { issues.push((error as Error).message); }
  return symbolData(pins, issues);
}

function atom(expression: SExpr[] | undefined, index: number): string | undefined {
  const value = expression?.[index];
  return typeof value === 'string' ? value : undefined;
}

export function extractFromKiCadSymbol(sexp: string): SymbolData {
  const pins: PinInfo[] = [], issues: string[] = [];
  try {
    // The shared structural scanner validates balanced strings/parens, including
    // the complete input rather than only the first expression accepted by parseSExpr.
    const roots = [...childExpressions(`(${sexp})`)];
    if (roots.length !== 1 || sexp.slice(0, roots[0].start - 1).trim() || sexp.slice(roots[0].end - 1).trim()) {
      throw new Error('Expected exactly one KiCad symbol or library expression');
    }
    const root = parseSExpr(sexp);
    const tag = getTag(root);
    if (tag !== 'symbol' && tag !== 'kicad_symbol_lib') throw new Error('Expected a KiCad symbol or library');
    const symbols = tag === 'symbol' ? [root] : findChildren(root, 'symbol');
    if (symbols.length !== 1) issues.push('Expected one symbol definition; multiple/empty libraries are unsupported');
    function visit(symbol: SExpr): void {
      if (findChild(symbol, 'extends')) issues.push('Inherited symbol pins require an unavailable base definition');
      for (const pin of findChildren(symbol, 'pin')) {
        const value = (name: string): SExpr[] | undefined => {
          const fields = findChildren(pin, name);
          if (fields.length !== 1) issues.push(`Pin ${atom(findChild(pin, 'number'), 1) ?? ''}: expected one ${name} field`);
          return fields[0];
        };
        const at = value('at'), name = value('name'), number = value('number');
        if (atom(name, 1) === undefined) issues.push('Pin name metadata unavailable');
        pins.push({
          number: atom(number, 1) ?? '', name: atom(name, 1) ?? '',
          // KiCad .kicad_sym coordinates are already millimetres.
          x: finite(atom(at, 1)), y: finite(atom(at, 2)), rotation: normalizeAngle(finite(atom(at, 3))),
          electrical: electricalType(atom(pin, 1)),
        });
      }
      for (const child of findChildren(symbol, 'symbol')) {
        const unit = atom(child, 1)?.match(/_(\d+)_(\d+)$/);
        if (!unit || Number(unit[1]) > 1 || Number(unit[2]) > 1) {
          issues.push('Multi-unit or alternate symbol representations are unsupported');
        }
        visit(child);
      }
    }
    for (const symbol of symbols) visit(symbol);
  } catch (error) { issues.push((error as Error).message); }
  return symbolData(pins, issues);
}

/** Strict pin comparison, modulo a single translation (never rotation or scale). */
export function compareSymbols(reference: SymbolData, generated: SymbolData, options: ComparisonOptions = {}): SymbolComparisonResult {
  const diffs: PinDiff[] = [];
  const error = (pinNumber: string, field: PinDiff['field'], message: string, expected?: string | number, actual?: string | number): void => {
    diffs.push({ pinNumber, field, severity: 'error', message, expected, actual });
  };
  const requested = options.positionTolerance;
  const tolerance = Number.isFinite(requested) && requested! >= 0
    ? Math.min(requested!, DEFAULT_COMPARISON_OPTIONS.positionTolerance)
    : DEFAULT_COMPARISON_OPTIONS.positionTolerance;
  function index(data: SymbolData, source: string): Map<string, PinInfo> {
    const result = new Map<string, PinInfo>();
    for (const issue of data.issues ?? []) error(source, 'coverage', issue);
    if (!data.pins.length) error(source, 'coverage', `${source} has no verifiable pins`);
    for (const pin of data.pins) {
      if (!pin.number.trim()) error(source, 'identity', `${source} has a pin without a number`);
      if (result.has(pin.number)) error(pin.number, 'identity', `${source} has duplicate pin number ${pin.number}`);
      else result.set(pin.number, pin);
      if (![pin.x, pin.y, pin.rotation].every(Number.isFinite)) error(pin.number, 'coverage', `${source} pin position/direction unavailable or invalid`);
      if (!pin.electrical || pin.electrical === 'unknown' || !Object.hasOwn(ELECTRICAL_TYPES, pin.electrical)) {
        error(pin.number, 'coverage', `${source} declared electrical type unavailable or unsupported`);
      }
      if (typeof pin.name !== 'string') error(pin.number, 'coverage', `${source} pin name unavailable`);
    }
    return result;
  }
  const refs = index(reference, 'Reference'), gens = index(generated, 'Generated');
  // Fit only one global translation using corresponding identities. This retains
  // relative layout and cannot let extra/missing identities steal positional matches.
  let tx = 0, ty = 0, count = 0;
  for (const [number, ref] of refs) {
    const gen = gens.get(number);
    if (gen && [ref.x, ref.y, gen.x, gen.y].every(Number.isFinite)) {
      tx += gen.x - ref.x; ty += gen.y - ref.y; count++;
    }
  }
  if (count) { tx /= count; ty /= count; }
  for (const [number, ref] of refs) {
    const gen = gens.get(number);
    if (!gen) { error(number, 'missing', `Pin ${number} (${ref.name}) missing in generated output`); continue; }
    if (Math.hypot(gen.x - tx - ref.x, gen.y - ty - ref.y) > tolerance) {
      error(number, 'position', `Connection layout differs after translation: expected (${ref.x}, ${ref.y}), got (${gen.x - tx}, ${gen.y - ty}) mm`,
        `${ref.x}, ${ref.y}`, `${gen.x - tx}, ${gen.y - ty}`);
    }
    if (!options.ignorePinNames && ref.name !== gen.name) error(number, 'name', `Name differs: expected "${ref.name}", got "${gen.name}"`, ref.name, gen.name);
    const angle = normalizeAngle(ref.rotation - gen.rotation);
    if (Math.min(angle, 360 - angle) > 1) error(number, 'rotation', `Direction differs: expected ${ref.rotation} degrees, got ${gen.rotation} degrees`, ref.rotation, gen.rotation);
    if (ref.electrical !== gen.electrical) error(number, 'electrical', `Declared electrical type differs: expected ${ref.electrical ?? 'unknown'}, got ${gen.electrical ?? 'unknown'}`, ref.electrical ?? 'unknown', gen.electrical ?? 'unknown');
  }
  for (const [number, pin] of gens) if (!refs.has(number)) error(number, 'extra', `Extra pin ${number} (${pin.name}) in generated output`);
  const pinCountMatch = reference.pins.length === generated.pins.length;
  return {
    passed: diffs.length === 0 && pinCountMatch, pinCountMatch,
    coverage: { pinNamesCompared: !options.ignorePinNames, bodyGraphicsCompared: false, pinLengthsCompared: false, pinStylesCompared: false },
    referencePinCount: reference.pins.length, generatedPinCount: generated.pins.length,
    diffs, errors: diffs, warnings: [],
  };
}

export function formatSymbolComparisonResult(result: SymbolComparisonResult): string {
  const lines = [
    `Symbol Pin Comparison: ${result.passed ? 'PASS' : 'FAIL'}`,
    `  Pin count: ${result.generatedPinCount}/${result.referencePinCount}`,
    '  Scope: identity, translated connection layout, direction, declared electrical types',
    `  Pin names: ${result.coverage.pinNamesCompared ? 'compared' : 'explicitly excluded'}`,
    '  Not compared: body graphics, pin lengths, pin graphical styles',
  ];
  for (const diff of result.diffs) lines.push(`  ${diff.severity.toUpperCase()} ${diff.pinNumber}: ${diff.message}`);
  return lines.join('\n');
}
