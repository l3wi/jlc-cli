import { describe, expect, it } from 'bun:test';
import {
  compareSymbols, extractFromKiCadSymbol, extractFromReferenceSVG,
} from './symbol-comparator.js';

const left = '(pin input line (at -2.54 0 0) (length 2.54) (name "IN") (number "1"))';
const right = '(pin output line (at 2.54 0 180) (length 2.54) (name "OUT") (number "2"))';
function symbol(...pins: string[]) {
  return extractFromKiCadSymbol(`(kicad_symbol_lib (version 20231120) (symbol "Part (quoted)" (symbol "Part_1_1" ${pins.join(' ')})))`);
}
const source = `<svg><g c_origin="400,300">
  <g c_partid="part_pin" c_etype="pinpart" c_elec="1" c_spicepin="1" c_origin="390,300" c_rotation="180"><text>IN</text><text>1</text></g>
  <g c_partid="part_pin" c_etype="pinpart" c_elec="2" c_spicepin="2" c_origin="410,300" c_rotation="0"><text>OUT</text><text>2</text></g>
</g></svg>`;

describe('strict symbol pin validation', () => {
  it('compares real millimetres across source units and translation, not the old mil-scaled coordinates', () => {
    const reference = extractFromReferenceSVG(source);
    expect(compareSymbols(reference, symbol(left, right)).passed).toBe(true);
    const scaled = symbol(left.replace('-2.54', '-0.064516'), right.replace('2.54 0', '0.064516 0'));
    const result = compareSymbols(reference, scaled);
    expect(result.passed).toBe(false);
    expect(result.errors.some(error => error.field === 'position')).toBe(true);
  });

  it('normalizes every EasyEDA direction including vertical pins and angle wrapping', () => {
    const reference = extractFromReferenceSVG(`<svg>
      <g c_partid='part_pin' c_spicepin='1' c_elec='1' c_origin='0,0' c_rotation='-180'><text>IN</text><text>1</text></g>
      <g c_partid='part_pin' c_spicepin='2' c_elec='2' c_origin='0,20' c_rotation='90'><path d="M0 20v10"/><text>OUT</text><text>2</text></g>
    </svg>`);
    const generated = symbol(left.replace('-2.54 0 0', '0 2.54 360'), right.replace('2.54 0 180', '0 -2.54 270'));
    expect(compareSymbols(reference, generated).passed).toBe(true);
    const wrong = symbol(left.replace('-2.54 0 0', '0 2.54 0'), right.replace('2.54 0 180', '0 -2.54 90'));
    expect(compareSymbols(reference, wrong).errors.some(error => error.field === 'rotation')).toBe(true);
  });

  it('derives an omitted direction only from an unambiguous straight connection path', () => {
    const reference = source.replace('c_rotation="180"', 'c_rotation=""')
      .replace('<text>IN</text>', '<path d="M390 300h10"/><text>IN</text>');
    expect(compareSymbols(extractFromReferenceSVG(reference), symbol(left, right)).passed).toBe(true);
    const turned = extractFromReferenceSVG(reference.replace('M390 300h10', 'M390 300v10'));
    expect(compareSymbols(turned, symbol(left, right)).errors.some(error => error.field === 'rotation')).toBe(true);
    const bent = extractFromReferenceSVG(reference.replace('M390 300h10', 'M390 300h10v10'));
    expect(compareSymbols(bent, symbol(left, right)).errors.some(error => error.field === 'coverage')).toBe(true);
  });

  it('accepts one global translation but rejects relative layout changes even with legacy bypass options', () => {
    const translated = symbol(left.replace('-2.54 0', '97.46 -30'), right.replace('2.54 0', '102.54 -30'));
    expect(compareSymbols(symbol(left, right), translated).passed).toBe(true);
    for (const positionTolerance of [50, Infinity, NaN]) {
      const result = compareSymbols(symbol(left, right), symbol(left, right.replace('2.54 0', '2.8 0')), {
        positionTolerance, sizeWarningsOnly: true, ignoreExtraPads: true,
      });
      expect(result.passed).toBe(false);
      expect(result.errors.some(error => error.field === 'position')).toBe(true);
    }
  });

  it('allows tighter positional tolerances without a hidden tenfold multiplier', () => {
    const generated = symbol(left.replace('-2.54 0', '-2.56 0'), right.replace('2.54 0', '2.56 0'));
    expect(compareSymbols(symbol(left, right), generated).passed).toBe(true);
    expect(compareSymbols(symbol(left, right), generated, { positionTolerance: 0.01 }).passed).toBe(false);
  });

  it('rejects renamed, missing and duplicate pin identities rather than matching by position', () => {
    const reference = symbol(left, right);
    const renamed = compareSymbols(reference, symbol(left.replace('(number "1")', '(number "3")'), right));
    expect(renamed.passed).toBe(false);
    expect(renamed.errors.map(error => error.field)).toEqual(expect.arrayContaining(['missing', 'extra']));
    expect(compareSymbols(reference, symbol(left)).passed).toBe(false);
    const duplicate = symbol(left, left);
    expect(compareSymbols(duplicate, duplicate).errors.some(error => error.field === 'identity')).toBe(true);
    const unnamed = symbol(left.replace('(number "1")', '(number "")'), right);
    expect(compareSymbols(unnamed, unnamed).passed).toBe(false);
  });

  it('makes names, directions and known electrical mismatches blocking, not informational', () => {
    const result = compareSymbols(symbol(left, right), symbol(
      left.replace('(name "IN")', '(name "in")').replace('(at -2.54 0 0)', '(at -2.54 0 180)').replace('pin input', 'pin power_in'), right,
    ));
    expect(result.pinCountMatch).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.errors.map(error => error.field)).toEqual(expect.arrayContaining(['name', 'rotation', 'electrical']));
    expect(result.warnings).toEqual([]);
  });

  it('supports only an explicit name exclusion and discloses that exclusion', () => {
    const reference = symbol(left, right), renamed = symbol(left.replace('"IN"', '"RENAMED"'), right);
    expect(compareSymbols(reference, renamed).passed).toBe(false);
    const result = compareSymbols(reference, renamed, { ignorePinNames: true });
    expect(result.passed).toBe(true);
    expect(result.coverage.pinNamesCompared).toBe(false);
    expect(compareSymbols(reference, symbol(left.replace('pin input', 'pin passive'), right), { ignorePinNames: true }).passed).toBe(false);
  });

  it('reads c_elec rather than mistaking pinpart for an electrical role and never invents unknown roles', () => {
    expect(compareSymbols(extractFromReferenceSVG(source), symbol(left, right)).passed).toBe(true);
    const unknown = extractFromReferenceSVG(source.replace('c_elec="1"', 'c_elec="999"'));
    expect(unknown.pins[0].electrical).toBe('unknown');
    expect(compareSymbols(unknown, unknown).errors.some(error => error.field === 'coverage')).toBe(true);
    const unspecified = extractFromReferenceSVG(source.replace('c_elec="1"', 'c_elec="0"'));
    expect(compareSymbols(unspecified, symbol(left.replace('pin input', 'pin unspecified'), right)).passed).toBe(true);
    expect(compareSymbols(unspecified, symbol(left.replace('pin input', 'pin passive'), right)).passed).toBe(false);
  });

  it('rejects missing or non-finite source evidence without silently dropping pins or inventing defaults', () => {
    for (const incomplete of [
      source.replace('c_rotation="180"', ''), source.replace('c_origin="390,300"', ''),
      source.replace('c_origin="390,300"', 'c_origin="NaN,300"'), source.replace('c_elec="1"', ''),
      source.replace('<text>IN</text><text>1</text>', ''), source.replace('c_spicepin="1"', ''),
      source.replace('<text>IN</text>', ''),
    ]) {
      const result = compareSymbols(extractFromReferenceSVG(incomplete), symbol(left, right));
      expect(result.passed).toBe(false);
      expect(result.errors.some(error => error.field === 'coverage' || error.field === 'identity')).toBe(true);
    }
    const ambiguousNumericName = extractFromReferenceSVG(source.replace('<text>IN</text>', ''));
    expect(compareSymbols(ambiguousNumericName, ambiguousNumericName).passed).toBe(false);
    expect(compareSymbols(extractFromReferenceSVG('<svg/>'), symbol()).passed).toBe(false);
  });

  it('parses escaped names, parentheses, numeric exponents and unquoted pin numbers structurally', () => {
    const name = 'IN \\"quoted\\" (pin fake)';
    const generated = extractFromKiCadSymbol(`(symbol "Part"
      (property "note" "(pin output line (at 999 999 0))")
      (symbol "Part_1_1" ${left.replace('-2.54', '-2.54e0').replace('"IN"', `"${name}"`).replace('(number "1")', '(number 1)')} ${right}))`);
    const reference = extractFromReferenceSVG(source.replace('>IN<', '>IN &quot;<tspan>quoted</tspan>&quot; (pin fake)<'));
    expect(compareSymbols(reference, generated).passed).toBe(true);
  });


  it('uses explicit connector pinpart names without treating arbitrary comments as pin names', () => {
    const numeric = source.replace('<text>IN</text>', '<text>1</text>');
    const annotated = numeric.replace('</svg>', '<g c_partid="part_annotation" c_etype="pinpart"><text>J1/IN</text></g></svg>');
    expect(compareSymbols(extractFromReferenceSVG(annotated), symbol(left, right)).passed).toBe(true);
    expect(compareSymbols(extractFromReferenceSVG(annotated.replace('J1/IN', 'J1/WRONG')), symbol(left, right)).passed).toBe(false);
    expect(compareSymbols(extractFromReferenceSVG(annotated.replace('c_etype="pinpart"><text>J1', 'c_etype="comment"><text>J1')), symbol(left, right)).passed).toBe(false);
  });
  it('reports malformed, ambiguous or unsupported symbol evidence instead of passing its parsed subset', () => {
    for (const bad of [
      `(symbol "Part" ${left} ${right}`, `(symbol "Part" ${left} ${right}) trailing`,
      `(symbol "Part" ${left} ${right})(symbol "Other")`,
      `(symbol "Part" (extends "Base") ${left} ${right})`,
      `(symbol "Part" (symbol "Part_1_2" ${left} ${right}))`,
      `(symbol "Part" ${left.replace('(at -2.54 0 0)', '(at -2.54 0 0) (at 99 99 0)')} ${right})`,
    ]) {
      const result = compareSymbols(symbol(left, right), extractFromKiCadSymbol(bad));
      expect(result.passed).toBe(false);
      expect(result.errors.some(error => error.field === 'coverage')).toBe(true);
    }
    expect(compareSymbols(extractFromReferenceSVG(source.replace('</svg>', '')), symbol(left, right)).passed).toBe(false);
    expect(compareSymbols(extractFromReferenceSVG(source.replace('<g c_origin', '<g transform="rotate(90)" c_origin')), symbol(left, right)).passed).toBe(false);
  });

  it('does not advertise pin-only success as body graphics, length or style validation', () => {
    const reference = extractFromReferenceSVG(source.replace('</svg>', '<rect x="380" y="290" width="40" height="20"/></svg>'));
    const generated = symbol(
      left.replace('input line', 'input clock').replace('(length 2.54)', '(length 7.62)'), right,
      '(circle (center 0 0) (radius 1) (stroke (width 0.1)) (fill (type none)))',
    );
    const result = compareSymbols(reference, generated);
    expect(result.passed).toBe(true);
    expect(result.coverage).toEqual({ pinNamesCompared: true, bodyGraphicsCompared: false, pinLengthsCompared: false, pinStylesCompared: false });
  });
});
