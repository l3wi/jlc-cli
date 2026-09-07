import type {
  PadInfo, ViaInfo, HoleInfo, DrillInfo, FootprintData, FootprintComparisonResult,
  PadDiff, ComparisonOptions,
} from './types.js';
import { DEFAULT_COMPARISON_OPTIONS } from './types.js';
import { childExpressions } from '../utils/sexpr.js';
import { flattenSvgPath } from '../converter/svg-path.js';
import { parseReferenceSvg, type ReferenceSvgNode } from './svg-parser.js';

const EE_TO_MM = 0.254;
const CURVE_ERROR = 0.001;
type Point = { x: number; y: number };

function finite(value: string | undefined, label: string): number {
  if (value === undefined || value.trim() === '' || !Number.isFinite(Number(value))) {
    throw new Error(`Missing or invalid ${label}`);
  }
  return Number(value);
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${label}`);
  return value;
}

// KiCad positive angles are counterclockwise in its Y-down coordinate system.
function rotate(p: Point, degrees = 0): Point {
  const a = -degrees * Math.PI / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}

function bounds(points: Point[]): FootprintData['bounds'] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return points.length ? { minX, maxX, minY, maxY } : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
}

function arcPoints(center: Point, rx: number, ry: number, start: number, end: number): Point[] {
  const radius = Math.max(rx, ry);
  const step = radius > CURVE_ERROR ? 2 * Math.acos(1 - CURVE_ERROR / radius) : Math.PI / 4;
  const count = Math.max(1, Math.ceil(Math.abs(end - start) / step));
  if (count > 100000) throw new Error('Geometry exceeds curve subdivision limit');
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = start + (end - start) * i / count;
    return { x: center.x + rx * Math.cos(a), y: center.y + ry * Math.sin(a) };
  });
}

function outline(pad: PadInfo): Point[] {
  positive(pad.width, 'copper width'); positive(pad.height, 'copper height');
  if (![pad.x, pad.y, pad.rotation ?? 0].every(Number.isFinite)) throw new Error('Invalid pad position/rotation');
  let points: Point[];
  const w = pad.width / 2, h = pad.height / 2;
  if (pad.shape === 'polygon' || pad.shape === 'custom') {
    if (!pad.polygon || pad.polygon.length < 3) throw new Error('Custom copper outline unavailable');
    points = pad.polygon;
    const area = points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p.x * q.y - q.x * p.y;
    }, 0);
    if (Math.abs(area) < 1e-12) throw new Error('Degenerate custom copper outline');
  } else if (pad.shape === 'rect') {
    points = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }];
  } else if (pad.shape === 'circle') {
    if (Math.abs(w - h) > 1e-8) throw new Error('Non-circular circle pad');
    points = arcPoints({ x: 0, y: 0 }, w, w, 0, Math.PI * 2);
  } else if (pad.shape === 'oval' || pad.shape === 'roundrect') {
    const r = pad.shape === 'oval' ? Math.min(w, h) : pad.cornerRadius;
    if (r === undefined || !Number.isFinite(r) || r < 0 || r > Math.min(w, h)) {
      throw new Error('Roundrect corner radius unavailable or invalid');
    }
    points = [
      ...arcPoints({ x: w - r, y: h - r }, r, r, 0, Math.PI / 2),
      ...arcPoints({ x: -w + r, y: h - r }, r, r, Math.PI / 2, Math.PI),
      ...arcPoints({ x: -w + r, y: -h + r }, r, r, Math.PI, Math.PI * 1.5),
      ...arcPoints({ x: w - r, y: -h + r }, r, r, Math.PI * 1.5, Math.PI * 2),
    ];
  } else {
    throw new Error(`Unsupported copper shape: ${pad.shape}`);
  }
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Invalid copper outline');
  return points.map(p => rotate(p, pad.rotation));
}

function footprintData(pads: PadInfo[], vias: ViaInfo[], holes: HoleInfo[], issues: string[]): FootprintData {
  const points: Point[] = [];
  for (const pad of [...pads, ...vias.flatMap(v => v.pad ? [v.pad] : [])]) {
    try { points.push(...outline(pad).map(p => ({ x: p.x + pad.x, y: p.y + pad.y }))); }
    catch (error) { issues.push(`Pad ${pad.number || '(unnamed)'}: ${(error as Error).message}`); }
  }
  points.push(...vias, ...holes);
  return { pads, vias, holes, bounds: bounds(points), issues };
}

// Structural boundaries come exclusively from childExpressions. This tokenizer
// only reads atoms in a single expression's header (including quoted atoms).
function atoms(expression: string): string[] {
  const result: string[] = [];
  let i = expression.indexOf('(') + 1;
  while (i < expression.length) {
    while (/\s/.test(expression[i] ?? '') && i < expression.length) i++;
    if (expression[i] === '(' || expression[i] === ')' || i >= expression.length) break;
    let atom = '';
    if (expression[i] === '"') {
      i++;
      while (i < expression.length && expression[i] !== '"') {
        if (expression[i] === '\\') i++;
        atom += expression[i++];
      }
      if (expression[i++] !== '"') throw new Error('Unterminated S-expression string');
    } else {
      while (i < expression.length && !/[\s()]/.test(expression[i])) atom += expression[i++];
    }
    result.push(atom);
  }
  return result;
}

function children(expression: string): string[] {
  return [...childExpressions(expression)].map(r => expression.slice(r.start, r.end));
}

function child(expression: string, name: string): string | undefined {
  return children(expression).find(c => atoms(c)[0] === name);
}

function values(expression: string, name: string): string[] {
  const found = child(expression, name);
  return found ? atoms(found).slice(1) : [];
}

function parseDrill(expression: string): DrillInfo | undefined {
  const block = child(expression, 'drill');
  if (!block) return undefined;
  const args = atoms(block).slice(1);
  const oval = args[0] === 'oval';
  const width = positive(finite(args[oval ? 1 : 0], 'drill width'), 'drill width');
  const height = oval ? positive(finite(args[2], 'drill height'), 'drill height') : width;
  const offset = values(block, 'offset');
  return { width, height, offsetX: offset.length ? finite(offset[0], 'drill offset X') : 0,
    offsetY: offset.length ? finite(offset[1], 'drill offset Y') : 0, rotation: 0 };
}

function parseKiCadPad(expression: string): PadInfo {
  const [, number, type, shape] = atoms(expression);
  if (!['smd', 'thru_hole', 'np_thru_hole', 'connect'].includes(type)) throw new Error(`Unsupported pad type ${type}`);
  if (!['rect', 'circle', 'oval', 'roundrect', 'custom'].includes(shape)) throw new Error(`Unsupported pad shape ${shape}`);
  const at = values(expression, 'at'), size = values(expression, 'size');
  const layers = values(expression, 'layers').filter(l => l.endsWith('.Cu'));
  const layerId = layers.length === 1 && layers[0] === 'F.Cu' ? 1
    : layers.length === 1 && layers[0] === 'B.Cu' ? 2
      : layers.length === 1 && layers[0] === '*.Cu' ? 11 : NaN;
  if (!Number.isFinite(layerId)) throw new Error(`Unsupported or missing copper layers: ${layers.join(', ')}`);
  const drill = parseDrill(expression);
  if ((type === 'thru_hole' || type === 'np_thru_hole') && !drill) throw new Error('Through-hole pad has no drill geometry');
  if (drill && type !== 'thru_hole' && type !== 'np_thru_hole') throw new Error('Surface/contact pad unexpectedly has a drill');
  const pad: PadInfo = { number, x: finite(at[0], 'pad X'), y: finite(at[1], 'pad Y'),
    rotation: at[2] === undefined ? 0 : finite(at[2], 'pad rotation'),
    width: positive(finite(size[0], 'pad width'), 'pad width'), height: positive(finite(size[1], 'pad height'), 'pad height'),
    shape: shape as PadInfo['shape'], layerId, hasHole: !!drill, drill,
    holeRadius: drill ? Math.min(drill.width, drill.height) / 2 : undefined, plated: type === 'thru_hole' };
  if (shape === 'roundrect') pad.cornerRadius = finite(values(expression, 'roundrect_rratio')[0], 'roundrect ratio') * Math.min(pad.width, pad.height);
  if (child(expression, 'chamfer') || child(expression, 'rect_delta')) throw new Error('Unsupported modified copper outline');
  if (shape === 'custom') {
    const primitives = children(child(expression, 'primitives') ?? '()');
    if (primitives.length !== 1) throw new Error('Custom copper requires a single verified primitive');
    const primitive = primitives[0], kind = atoms(primitive)[0];
    if (kind === 'gr_poly') {
      const width = values(primitive, 'width');
      if (width.length && finite(width[0], 'polygon stroke') !== 0) throw new Error('Stroked custom polygon is unverified');
      if (['none', 'no'].includes(values(primitive, 'fill')[0])) throw new Error('Unfilled custom polygon is unverified');
      pad.polygon = children(child(primitive, 'pts') ?? '()').map(p => {
        const [pointKind, x, y] = atoms(p);
        if (pointKind !== 'xy') throw new Error('Unsupported polygon point');
        return { x: finite(x, 'polygon X'), y: finite(y, 'polygon Y') };
      });
    } else if (kind === 'gr_line') {
      const start = values(primitive, 'start'), end = values(primitive, 'end');
      const a = { x: finite(start[0], 'line start X'), y: finite(start[1], 'line start Y') };
      const b = { x: finite(end[0], 'line end X'), y: finite(end[1], 'line end Y') };
      const width = positive(finite(values(primitive, 'width')[0], 'line width'), 'line width');
      pad.polygon = outline({ ...pad, shape: 'oval', width: Math.hypot(b.x-a.x, b.y-a.y)+width, height: width,
        rotation: -Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI })
        .map(p => ({ x: p.x+(a.x+b.x)/2, y: p.y+(a.y+b.y)/2 }));
    } else if (kind === 'gr_circle') {
      const center = values(primitive, 'center'), end = values(primitive, 'end');
      const a = { x: finite(center[0], 'circle center X'), y: finite(center[1], 'circle center Y') };
      const radius = positive(Math.hypot(finite(end[0], 'circle end X')-a.x, finite(end[1], 'circle end Y')-a.y), 'circle radius');
      if (finite(values(primitive, 'width')[0], 'circle stroke') !== 0 ||
        ['none', 'no'].includes(values(primitive, 'fill')[0])) throw new Error('Unfilled/stroked custom circle is unverified');
      pad.polygon = arcPoints(a, radius, radius, 0, Math.PI*2);
    } else throw new Error(`Unsupported custom copper primitive: ${kind}`);
    if (pad.polygon.length < 3) throw new Error('Custom polygon has fewer than three vertices');
    // The anchor is also copper. Do not silently ignore it if it protrudes.
    const anchorShape = values(child(expression, 'options') ?? '()', 'anchor')[0] ?? 'rect';
    const anchor = outline({ ...pad, shape: anchorShape === 'circle' ? 'circle' : 'rect', rotation: 0 });
    if (!anchor.every(p => insidePolygon(p, pad.polygon!))) throw new Error('Custom pad anchor extends outside polygon');
    const b = bounds(pad.polygon);
    pad.width = b.maxX - b.minX; pad.height = b.maxY - b.minY;
  }
  if (drill) {
    // KiCad's (at) locates the drill; serialized offset moves copper, not the hole.
    // PadInfo uses the copper center and a drill displacement relative to it.
    const copperOffset = rotate({ x: drill.offsetX, y: drill.offsetY }, pad.rotation);
    pad.x += copperOffset.x;
    pad.y += copperOffset.y;
    drill.offsetX = -drill.offsetX;
    drill.offsetY = -drill.offsetY;
  }
  return pad;
}

export function extractFromKiCadFootprint(sexp: string): FootprintData {
  const pads: PadInfo[] = [], vias: ViaInfo[] = [], holes: HoleInfo[] = [], issues: string[] = [];
  try {
    if (!['footprint', 'module'].includes(atoms(sexp)[0])) throw new Error('Not a KiCad footprint');
    for (const expression of children(sexp)) {
      const kind = atoms(expression)[0];
      try {
        if (kind === 'pad') {
          const pad = parseKiCadPad(expression);
          if (atoms(expression)[2] === 'np_thru_hole') {
            holes.push({ x: pad.x, y: pad.y, diameter: Math.min(pad.drill!.width, pad.drill!.height),
              plated: false, drill: pad.drill, rotation: pad.rotation });
          } else if (pad.number === '' && pad.hasHole) {
            vias.push({ x: pad.x, y: pad.y, outerDiameter: pad.width,
              holeDiameter: Math.min(pad.drill!.width, pad.drill!.height), pad });
          } else pads.push(pad);
        } else if (kind === 'via') {
          const at = values(expression, 'at'), layers = values(expression, 'layers');
          if (layers.length !== 2 || !layers.includes('F.Cu') || !layers.includes('B.Cu')) throw new Error('Blind/buried via layers unverified');
          const diameter = positive(finite(values(expression, 'size')[0], 'via size'), 'via size');
          const drill = parseDrill(expression);
          if (!drill) throw new Error('Missing via drill');
          const pad: PadInfo = { number: '', x: finite(at[0], 'via X'), y: finite(at[1], 'via Y'), width: diameter,
            height: diameter, shape: 'circle', layerId: 11, hasHole: true, drill, plated: true };
          vias.push({ x: pad.x, y: pad.y, outerDiameter: diameter, holeDiameter: drill.width, pad });
        } else if (values(expression, 'layer').some(layer => layer.endsWith('.Cu'))) {
          issues.push(`${kind}: non-pad copper geometry is unverified`);
        }
      } catch (error) { issues.push(`${kind}: ${(error as Error).message}`); }
    }
  } catch (error) { issues.push((error as Error).message); }
  return footprintData(pads, vias, holes, issues);
}

function insidePolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 1e-9 && p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// SVG extraction retains manufacturing metadata separately from rendered copper.
// In particular mask/paste children and the drill circle are not copper outlines.
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
interface SvgNode extends ReferenceSvgNode { children: SvgNode[]; matrix: Matrix }
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
function transform(p: Point, m: Matrix): Point { return { x: m[0]*p.x+m[2]*p.y+m[4], y: m[1]*p.x+m[3]*p.y+m[5] }; }
function numbers(text: string): number[] {
  if (!text.trim()) return [];
  return text.trim().split(/[\s,]+/).map(v => finite(v, 'SVG coordinate'));
}
function matrix(text = ''): Matrix {
  let result = IDENTITY;
  let end = 0;
  for (const match of text.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    if (text.slice(end, match.index).replace(/[\s,]/g, '')) throw new Error('Invalid SVG transform');
    const n = numbers(match[2]); let next: Matrix;
    if (match[1] === 'matrix' && n.length === 6) next = n as Matrix;
    else if (match[1] === 'translate' && (n.length === 1 || n.length === 2)) next = [1,0,0,1,n[0],n[1] ?? 0];
    else if (match[1] === 'scale' && (n.length === 1 || n.length === 2)) next = [n[0],0,0,n[1] ?? n[0],0,0];
    else if (match[1] === 'rotate' && (n.length === 1 || n.length === 3)) {
      const a = n[0]*Math.PI/180, c = Math.cos(a), s = Math.sin(a), x = n[1] ?? 0, y = n[2] ?? 0;
      next = [c,s,-s,c,x-c*x+s*y,y-s*x-c*y];
    } else throw new Error(`Unsupported SVG transform ${match[1]}`);
    result = multiply(result, next); end = match.index! + match[0].length;
  }
  if (text.slice(end).trim()) throw new Error('Invalid SVG transform');
  return result;
}
function xml(svg: string): SvgNode {
  const root = parseReferenceSvg(svg) as SvgNode;
  function visit(node: SvgNode, parent: Matrix): void {
    node.matrix = multiply(parent, matrix(node.attrs.transform));
    for (const child of node.children) visit(child, node.matrix);
  }
  visit(root, IDENTITY);
  return root;
}
function descendants(node: SvgNode): SvgNode[] { return node.children.flatMap(c => [c, ...descendants(c)]); }
function svgPoint(node: SvgNode, x: number, y: number): Point {
  const p = transform({ x, y }, node.matrix); return { x: p.x * EE_TO_MM, y: p.y * EE_TO_MM };
}
function svgPoints(node: SvgNode): Point[] {
  const a = node.attrs;
  if (node.tag === 'polygon' || node.tag === 'polyline') {
    const n = numbers(a.points ?? '');
    if (n.length < 4 || n.length % 2) throw new Error('Invalid SVG polygon/polyline');
    return Array.from({ length: n.length / 2 }, (_, i) => svgPoint(node, n[i*2], n[i*2+1]));
  }
  if (node.tag === 'path') {
    const paths = flattenSvgPath(a.d ?? '', CURVE_ERROR / EE_TO_MM / Math.max(Math.hypot(node.matrix[0], node.matrix[1]), Math.hypot(node.matrix[2], node.matrix[3]), 1));
    if (paths.length !== 1) throw new Error('Compound SVG copper path unverified');
    return paths[0].points.map(p => svgPoint(node, p.x, p.y));
  }
  throw new Error('Not an SVG point primitive');
}
function uniformScale(node: SvgNode): number {
  const m = node.matrix, sx = Math.hypot(m[0],m[1]), sy = Math.hypot(m[2],m[3]);
  if (Math.abs(sx-sy)>1e-8 || Math.abs(m[0]*m[2]+m[1]*m[3])>1e-8) throw new Error('Nonuniform transformed slot/drill unverified');
  return sx * EE_TO_MM;
}
function svgDrill(node: SvgNode, origin: Point): DrillInfo {
  let center: Point, width: number, height: number, rotation = 0;
  const a = node.attrs;
  if (node.tag === 'circle') {
    center = svgPoint(node, finite(a.cx, 'drill cx'), finite(a.cy, 'drill cy'));
    width = height = finite(a.r, 'drill radius') * 2 * uniformScale(node);
  } else if (node.tag === 'polyline' || node.tag === 'path') {
    const points = svgPoints(node);
    if (points.length !== 2) throw new Error('Bent/multisegment drill is unverified');
    const [start, end] = points;
    width = finite(a['stroke-width'], 'slot diameter') * uniformScale(node);
    height = width;
    width += Math.hypot(end.x-start.x, end.y-start.y);
    rotation = -Math.atan2(end.y-start.y, end.x-start.x)*180/Math.PI;
    center = { x: (start.x+end.x)/2, y: (start.y+end.y)/2 };
  } else throw new Error('Unsupported reference drill geometry');
  if (width < 0 || height < 0) throw new Error('Negative reference drill');
  return { width, height, offsetX: center.x-origin.x, offsetY: center.y-origin.y, rotation };
}
function svgCopper(node: SvgNode, origin: Point): Pick<PadInfo, 'shape'|'width'|'height'|'polygon'|'rotation'> {
  const a = node.attrs;
  let points: Point[];
  if (node.tag === 'polygon' || node.tag === 'path' || node.tag === 'polyline') {
    points = svgPoints(node);
    if (node.tag !== 'polygon' && points.length === 2) {
      const drill = svgDrill(node, origin);
      const pad: PadInfo = { number: '', x: 0, y: 0, width: drill.width, height: drill.height,
        shape: 'oval', layerId: 1, hasHole: false, rotation: drill.rotation };
      points = outline(pad).map(p => ({ x: p.x+origin.x+drill.offsetX, y: p.y+origin.y+drill.offsetY }));
    } else if (node.tag === 'polyline') throw new Error('Multisegment stroked copper unverified');
    else if (node.tag === 'path' && a.fill === 'none') throw new Error('Unfilled copper path unverified');
  } else if (node.tag === 'circle' || node.tag === 'ellipse') {
    const rx = finite(a[node.tag === 'circle' ? 'r' : 'rx'], 'copper radius');
    const ry = node.tag === 'circle' ? rx : finite(a.ry, 'copper radius Y');
    positive(rx, 'copper radius'); positive(ry, 'copper radius Y');
    const cx = finite(a.cx, 'copper cx'), cy = finite(a.cy, 'copper cy');
    points = arcPoints({x: cx*EE_TO_MM,y: cy*EE_TO_MM},rx*EE_TO_MM,ry*EE_TO_MM,0,Math.PI*2)
      .map(p => svgPoint(node,p.x/EE_TO_MM,p.y/EE_TO_MM));
  } else if (node.tag === 'rect') {
    const x = finite(a.x,'rect X'), y = finite(a.y,'rect Y');
    const width = positive(finite(a.width,'rect width'),'rect width')*EE_TO_MM;
    const height = positive(finite(a.height,'rect height'),'rect height')*EE_TO_MM;
    const rx = Number(a.rx ?? a.ry ?? 0)*EE_TO_MM, ry = Number(a.ry ?? a.rx ?? 0)*EE_TO_MM;
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || Math.abs(rx-ry)>1e-8) throw new Error('Elliptical rectangle corners unverified');
    points = outline({number:'',x:0,y:0,width,height,shape:rx ? 'roundrect':'rect',cornerRadius:rx,layerId:1,hasHole:false})
      .map(p => svgPoint(node,x+(p.x+width/2)/EE_TO_MM,y+(p.y+height/2)/EE_TO_MM));
  } else throw new Error(`Unsupported reference copper ${node.tag}`);
  const polygon = points.map(p => ({x:p.x-origin.x,y:p.y-origin.y}));
  const b = bounds(polygon);
  return { shape:'polygon',width:b.maxX-b.minX,height:b.maxY-b.minY,polygon,rotation:0 };
}

export function extractFromReferenceSVG(svg: string): FootprintData {
  const pads: PadInfo[] = [], vias: ViaInfo[] = [], holes: HoleInfo[] = [], issues: string[] = [];
  const originPads: PadInfo[] = [];
  try {
    const root = xml(svg);
    const nodes = descendants(root);
    const groups = nodes.filter(n => ['part_pad','part_via','part_hole'].includes(n.attrs.c_partid));
    const manufacturingNodes = new Set(groups.flatMap(g => [g, ...descendants(g)]));
    for (const node of nodes) {
      if (!manufacturingNodes.has(node) && ['1','2','11'].includes(node.attrs.layerid)) {
        issues.push(`${node.tag}: non-pad reference copper geometry is unverified`);
      }
    }
    for (const group of groups) {
      const a = group.attrs, kind = a.c_partid, label = `${kind} ${a.number ?? ''}`;
      try {
        const xy = numbers(a.c_origin ?? '');
        if (xy.length !== 2) throw new Error('Missing reference origin');
        const origin = svgPoint(group, xy[0], xy[1]);
        const shapes = descendants(group).filter(n => ['rect','circle','ellipse','polygon','polyline','path'].includes(n.tag));
        if (kind === 'part_hole') {
          const hole = shapes.find(n => n.tag === 'circle' || n.tag === 'polyline');
          if (!hole) throw new Error('Missing hole geometry');
          const drill = svgDrill(hole, origin);
          positive(drill.width,'hole width'); positive(drill.height,'hole height');
          holes.push({...origin,diameter:Math.min(drill.width,drill.height),drill,plated:a.plated === 'Y'});
          continue;
        }
        const childLayers = [...new Set(shapes.map(n => n.attrs.layerid).filter(id => ['1','2','11'].includes(id)))];
        const layerId = finite(a.layerid ?? (childLayers.length === 1 ? childLayers[0] : undefined),'reference copper layer');
        if (![1,2,11].includes(layerId)) throw new Error(`Unsupported reference copper layer ${layerId}`);
        const copperShapes = shapes.filter(n => !n.attrs.c_padid && !n.attrs.c_padhole && (!n.attrs.layerid || Number(n.attrs.layerid) === layerId));
        const copper = copperShapes[0];
        if (!copper) throw new Error('Missing reference copper geometry');
        const drillNode = kind === 'part_via' ? copperShapes[1] : shapes.find(n => n.attrs.c_padhole === '1');
        if (copperShapes.length !== (kind === 'part_via' ? 2 : 1)) throw new Error('Multiple/ambiguous reference copper primitives');
        if (!drillNode) throw new Error('Drill presence/absence unavailable in reference');
        const rawDrill = svgDrill(drillNode,origin);
        const hasHole = rawDrill.width > 0 || rawDrill.height > 0;
        const drill = hasHole ? rawDrill : undefined;
        const plated = kind === 'part_via' ? true : a.plated === 'Y' ? true : a.plated === 'N' ? false : undefined;
        if (hasHole && plated === undefined) issues.push(`${label}: drill plating unavailable in reference`);
        const pad: PadInfo = {number:a.number ?? '',...origin,...svgCopper(copper,origin),layerId,hasHole,drill,plated,
          holeRadius:drill ? Math.min(drill.width,drill.height)/2 : undefined};
        if (kind === 'part_pad') originPads.push(pad);
        if (kind === 'part_via') vias.push({...origin,outerDiameter:pad.width,holeDiameter:rawDrill.width,pad});
        else if (hasHole && plated === false) holes.push({...origin,diameter:Math.min(rawDrill.width,rawDrill.height),drill:rawDrill,plated:false});
        else pads.push(pad);
      } catch (error) { issues.push(`${label}: ${(error as Error).message}`); }
    }
  } catch (error) { issues.push(`SVG: ${(error as Error).message}`); }
  // Compare in the converter's copper-envelope-centered coordinate system.
  const envelope = bounds(originPads.flatMap(p => {
    try { return outline(p).map(q => ({x:q.x+p.x,y:q.y+p.y})); }
    catch (error) { issues.push(`Pad ${p.number}: ${(error as Error).message}`); return []; }
  }));
  const center = {x:(envelope.minX+envelope.maxX)/2,y:(envelope.minY+envelope.maxY)/2};
  for (const p of [...pads,...vias,...holes]) { p.x -= center.x; p.y -= center.y; }
  for (const via of vias) if (via.pad) { via.pad.x=via.x; via.pad.y=via.y; }
  return footprintData(pads,vias,holes,issues);
}

// Is every point of a segment within tolerance of a polygon boundary? Each
// target edge contributes its exact capsule intersection interval. Unlike vertex
// checks, this also detects a concave notch across the middle of a long edge.
function segmentCovered(a: Point, b: Point, polygon: Point[], tolerance: number): boolean {
  const dx=b.x-a.x, dy=b.y-a.y, length2=dx*dx+dy*dy;
  const intervals: Array<[number,number]> = [];
  function disk(p: Point) {
    const x=a.x-p.x,y=a.y-p.y,c=x*x+y*y-tolerance*tolerance;
    if (length2<=1e-24) { if (c<=1e-12) intervals.push([0,1]); return; }
    const d=x*dx+y*dy, discriminant=d*d-length2*c;
    if (discriminant>=0) { const root=Math.sqrt(discriminant); intervals.push([(-d-root)/length2,(-d+root)/length2]); }
  }
  function clip(range: [number,number], value: number, delta: number, lo: number, hi: number): boolean {
    if (Math.abs(delta)<1e-14) return value>=lo-1e-12 && value<=hi+1e-12;
    const t1=(lo-value)/delta,t2=(hi-value)/delta;
    range[0]=Math.max(range[0],Math.min(t1,t2)); range[1]=Math.min(range[1],Math.max(t1,t2));
    return range[0]<=range[1];
  }
  for (let i=0;i<polygon.length;i++) {
    const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q.x-p.x,ey=q.y-p.y,l2=ex*ex+ey*ey;
    disk(p);
    if (l2<=1e-24) continue;
    // Normalize the target edge before clipping. Near-duplicate arc endpoints
    // must not turn the absolute arithmetic epsilon into an unbounded capsule.
    const length=Math.sqrt(l2), ux=ex/length, uy=ey/length;
    const range: [number,number]=[0,1],x=a.x-p.x,y=a.y-p.y;
    if (clip(range,x*ux+y*uy,dx*ux+dy*uy,0,length) && clip(range,x*uy-y*ux,dx*uy-dy*ux,-tolerance,tolerance)) intervals.push(range);
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  let covered=0;
  for (const [start,end] of intervals) {
    if (start>covered+1e-9) return false;
    covered=Math.max(covered,end);
    if (covered>=1-1e-9) return true;
  }
  return false;
}
function outlinesMatch(a: Point[], b: Point[], tolerance: number): boolean {
  return a.every((p,i)=>segmentCovered(p,a[(i+1)%a.length],b,tolerance)) && b.every((p,i)=>segmentCovered(p,b[(i+1)%b.length],a,tolerance));
}
function drillOutline(pad: PadInfo): Point[] {
  const d=pad.drill;
  if (!d) throw new Error('Full drill geometry unavailable');
  if (![d.offsetX,d.offsetY,d.rotation].every(Number.isFinite)) throw new Error('Invalid drill offset/rotation');
  return outline({...pad,x:0,y:0,width:d.width,height:d.height,shape:'oval',rotation:d.rotation,polygon:undefined})
    .map(p=>rotate({x:p.x+d.offsetX,y:p.y+d.offsetY},pad.rotation));
}
function viaPad(via: ViaInfo): PadInfo {
  if (!via.pad) throw new Error('Via copper layer, plating and full drill geometry unavailable');
  return {...via.pad,x:via.x,y:via.y};
}
function holePad(hole: HoleInfo): PadInfo {
  if (!hole.drill) throw new Error('Full hole geometry unavailable');
  return {number:'',x:hole.x,y:hole.y,width:hole.drill.width,height:hole.drill.height,shape:'oval',layerId:11,
    hasHole:true,plated:hole.plated,drill:hole.drill,rotation:hole.rotation};
}

export function compareFootprints(reference: FootprintData, generated: FootprintData, options: ComparisonOptions = {}): FootprintComparisonResult {
  // Shared legacy symbol options cannot downgrade manufacturing failures.
  const tolerance = (value: number | undefined, maximum: number): number => Number.isFinite(value) && value! >= 0 ? Math.min(value!,maximum) : maximum;
  const positionTolerance=tolerance(options.positionTolerance,DEFAULT_COMPARISON_OPTIONS.positionTolerance);
  const sizeTolerance=tolerance(options.sizeTolerance,DEFAULT_COMPARISON_OPTIONS.sizeTolerance);
  const holeTolerance=tolerance(options.holeTolerance,DEFAULT_COMPARISON_OPTIONS.holeTolerance);
  const diffs: PadDiff[]=[];
  const error=(padNumber:string,field:PadDiff['field'],message:string) => diffs.push({padNumber,field,message,severity:'error'});
  for (const [source,data] of [['Reference',reference],['Generated',generated]] as const) {
    for (const issue of data.issues ?? []) error(source,'coverage',issue);
    if (!data.pads.length) error(source,'coverage',`${source} has no verifiable electrical pads`);
  }
  function padDifferences(a:PadInfo,b:PadInfo,drillOnly=false): Array<{field:PadDiff['field'];message:string}> {
    const result: Array<{field:PadDiff['field'];message:string}>=[];
    const add=(field:PadDiff['field'],message:string)=>result.push({field,message});
    if (![a.x,a.y,b.x,b.y].every(Number.isFinite)) add('coverage','Invalid position');
    else if (Math.hypot(a.x-b.x,a.y-b.y)>positionTolerance) add('position',`Position differs: (${a.x}, ${a.y}) vs (${b.x}, ${b.y}) mm`);
    try {
      if (!drillOnly) {
        if (![1,2,11].includes(a.layerId) || ![1,2,11].includes(b.layerId)) add('coverage','Copper layer unavailable or unsupported');
        else if (a.layerId!==b.layerId) add('layer',`Copper layer differs: ${a.layerId} vs ${b.layerId}`);
        if (!outlinesMatch(outline(a),outline(b),sizeTolerance/2)) add('shape',`World copper geometry differs (${a.shape} ${a.width}x${a.height} at ${a.rotation ?? 0} degrees vs ${b.shape} ${b.width}x${b.height} at ${b.rotation ?? 0} degrees)`);
      }
      if (typeof a.hasHole !== 'boolean' || typeof b.hasHole !== 'boolean') add('coverage','Drill presence unavailable');
      else if (a.hasHole!==b.hasHole) add('hole','Drill presence differs');
      else if (a.hasHole) {
        if (a.plated===undefined || b.plated===undefined) add('coverage','Drill plating unavailable');
        else if (a.plated!==b.plated) add('plating',`Drill plating differs: ${a.plated} vs ${b.plated}`);
        // Boundary displacement is half a diameter change; use half the stated
        // hole-size tolerance so both slot axes obey the diameter contract.
        if (!outlinesMatch(drillOutline(a),drillOutline(b),holeTolerance/2)) add('hole','Drill diameter, slot axes, orientation or offset differs');
      }
    } catch (e) { add('coverage',(e as Error).message); }
    return result;
  }
  function compareSet(label:string,refs:PadInfo[],gens:PadInfo[],named:boolean,drillOnly=false) {
    // First find a maximum one-to-one matching of genuinely equivalent items.
    // This prevents a greedy nearest match stealing a repeated pad's only match.
    const matching=new Map<number,number>();
    const differences=refs.map(a=>gens.map(b=>named && a.number!==b.number ? null : padDifferences(a,b,drillOnly)));
    function assign(i:number,seen:Set<number>):boolean {
      for (let j=0;j<gens.length;j++) {
        if (seen.has(j) || differences[i][j]?.length!==0) continue;
        seen.add(j);
        const previous=matching.get(j);
        if (previous===undefined || assign(previous,seen)) { matching.set(j,i); return true; }
      }
      return false;
    }
    for (let i=0;i<refs.length;i++) assign(i,new Set());
    const usedRefs=new Set(matching.values()),usedGens=new Set(matching.keys());
    for (let i=0;i<refs.length;i++) {
      if (usedRefs.has(i)) continue;
      const a=refs[i];
      let best=-1,distance=Infinity;
      for (let j=0;j<gens.length;j++) {
        if (usedGens.has(j) || differences[i][j]===null) continue;
        const d=Math.hypot(a.x-gens[j].x,a.y-gens[j].y);
        if (best<0 || d<distance) { best=j; distance=d; }
      }
      const id=`${label} ${a.number || i+1}`;
      if (best<0) error(id,'missing',`${id} missing in generated output`);
      else { usedGens.add(best); for (const diff of differences[i][best]!) error(id,diff.field,diff.message); }
    }
    for (let j=0;j<gens.length;j++) if (!usedGens.has(j)) error(`${label} ${gens[j].number || j+1}`,'extra',`Extra ${label.toLowerCase()} at (${gens[j].x}, ${gens[j].y}) mm`);
  }
  function convertItems<T>(items:T[],convert:(item:T)=>PadInfo,source:string):PadInfo[] {
    return items.flatMap((item,i)=>{try{return [convert(item)];}catch(e){error(`${source} ${i+1}`,'coverage',(e as Error).message);return [];}});
  }
  compareSet('Pad',reference.pads,generated.pads,true);
  compareSet('Via',convertItems(reference.vias,viaPad,'Reference via'),convertItems(generated.vias,viaPad,'Generated via'),false);
  compareSet('Hole',convertItems(reference.holes,holePad,'Reference hole'),convertItems(generated.holes,holePad,'Generated hole'),false,true);
  const padCountMatch=reference.pads.length===generated.pads.length;
  const viaCountMatch=reference.vias.length===generated.vias.length;
  const holeCountMatch=reference.holes.length===generated.holes.length;
  return {passed:diffs.length===0 && padCountMatch && viaCountMatch && holeCountMatch,padCountMatch,viaCountMatch,holeCountMatch,
    referencePadCount:reference.pads.length,generatedPadCount:generated.pads.length,
    referenceViaCount:reference.vias.length,generatedViaCount:generated.vias.length,diffs,errors:diffs,warnings:[]};
}

export function formatComparisonResult(result: FootprintComparisonResult): string {
  const lines=[`Footprint Comparison: ${result.passed ? 'PASS' : 'FAIL'}`,
    `  Pad count: ${result.generatedPadCount}/${result.referencePadCount}`,
    `  Via count: ${result.generatedViaCount}/${result.referenceViaCount}`,
    `  Hole count: ${result.holeCountMatch ? 'matches' : 'DIFFERS'}`];
  for (const diff of result.diffs) lines.push(`  ${diff.severity.toUpperCase()} ${diff.padNumber}: ${diff.message}`);
  return lines.join('\n');
}
