import { describe, expect, it } from 'bun:test';
import { compareFootprints, extractFromKiCadFootprint, extractFromReferenceSVG } from './footprint-comparator.js';

const anchor = '(pad 1 smd rect (at 0 0) (size 2 1) (layers F.Cu))';
function footprint(...pads: string[]) {
  return extractFromKiCadFootprint(`(footprint "Test (quoted)" ${pads.join('\n')})`);
}
function comparison(reference: string, generated: string) {
  return compareFootprints(footprint(reference), footprint(generated));
}
const via = '(pad "" thru_hole circle (at 3 0) (size 1 1) (drill 0.508) (layers "*.Cu"))';
const hole = '(pad "" np_thru_hole circle (at -3 0) (size 0.8 0.8) (drill 0.8) (layers "*.Cu"))';
const tht = '(pad 1 thru_hole circle (at 0 0) (size 5 5) (drill 0.508) (layers "*.Cu"))';

function referencePad(copper: string, extra = '', drill = '<circle c_padhole="1" cx="0" cy="0" r="0" />') {
  return `<svg><g c_partid="part_pad" number="1" c_origin="0,0" layerid="1" ${extra}>${copper}${drill}</g></svg>`;
}

describe('manufacturing footprint comparison', () => {
  it('fails the old combined false-pass: rotation, layer, drill and extra manufacturing features', () => {
    const ref = footprint('(pad 1 thru_hole rect (at 0 0) (size 5 2) (drill 0.508) (layers F.Cu))');
    const gen = footprint('(pad 1 thru_hole rect (at 0 0 90) (size 5 2) (drill 4) (layers B.Cu))', via, hole);
    const result = compareFootprints(ref, gen, { positionTolerance: 50, sizeWarningsOnly: true, ignoreExtraPads: true });
    expect(result.passed).toBe(false);
    expect(result.viaCountMatch).toBe(false);
    expect(result.holeCountMatch).toBe(false);
    expect(result.errors.map(e => e.field)).toEqual(expect.arrayContaining(['shape', 'layer', 'hole', 'extra']));
  });

  it('compares real copper rotation while accepting symmetry and genuine width/height swaps', () => {
    expect(comparison(anchor, anchor.replace('(at 0 0)', '(at 0 0 90)')).passed).toBe(false);
    expect(comparison(anchor, anchor.replace('(at 0 0)', '(at 0 0 180)')).passed).toBe(true);
    expect(comparison(anchor, anchor.replace('(size 2 1)', '(size 1 2)').replace('(at 0 0)', '(at 0 0 90)')).passed).toBe(true);
    expect(comparison(anchor, anchor.replace('(size 2 1)', '(size 1 2)')).passed).toBe(false);
  });

  it('checks copper layer and cannot ignore renamed or extra co-located pads', () => {
    expect(comparison(anchor, anchor.replace('F.Cu', 'B.Cu')).errors.some(e => e.field === 'layer')).toBe(true);
    expect(comparison(anchor, anchor.replace('pad 1', 'pad 2')).passed).toBe(false);
    const result = compareFootprints(footprint(anchor), footprint(anchor, anchor), { ignoreExtraPads: true });
    expect(result.passed).toBe(false);
    expect(result.errors.filter(e => e.field === 'extra')).toHaveLength(1);
  });

  it('does not let legacy options increase manufacturing tolerances or downgrade errors', () => {
    const result = compareFootprints(footprint(anchor), footprint(anchor.replace('(at 0 0)', '(at 4 0)').replace('(size 2 1)', '(size 2.5 1)')), {
      positionTolerance: 50, sizeTolerance: Infinity, sizeWarningsOnly: true,
    });
    expect(result.passed).toBe(false);
    expect(result.errors.map(e => e.field)).toEqual(expect.arrayContaining(['position', 'shape']));
  });

  it('matches repeated named and unnamed pads one-to-one without greedy false failures', () => {
    const pad = (number: string, x: number) => `(pad "${number}" smd rect (at ${x} 0) (size 1 1) (layers F.Cu))`;
    for (const number of ['GND', '']) {
      const reference = footprint(pad(number, 0), pad(number, 0.04));
      const generated = footprint(pad(number, 0.02), pad(number, -0.03));
      expect(compareFootprints(reference, generated).passed).toBe(true);
      expect(compareFootprints(reference, footprint(pad(number, 0.02), pad(number, 2))).passed).toBe(false);
    }
  });

  it('uses full drill diameters, not radii or presence-only checks', () => {
    expect(comparison(tht, tht.replace('drill 0.508', 'drill 4')).errors.some(e => e.field === 'hole')).toBe(true);
    expect(comparison(tht, tht.replace('drill 0.508', 'drill 0.538')).passed).toBe(false);
    expect(comparison(tht, tht.replace('drill 0.508', 'drill 0.518')).passed).toBe(true);
    const incomplete = footprint(tht);
    delete incomplete.pads[0].drill;
    expect(compareFootprints(footprint(tht), incomplete).errors.some(e => e.field === 'coverage')).toBe(true);
  });

  it('checks both slot axes and their world orientation', () => {
    const slot = tht.replace('drill 0.508', 'drill oval 2 0.508');
    expect(comparison(slot, slot.replace('oval 2 0.508', 'oval 0.508 2')).passed).toBe(false);
    expect(comparison(slot, slot.replace('oval 2 0.508', 'oval 0.508 2').replace('(at 0 0)', '(at 0 0 90)')).passed).toBe(true);
    expect(comparison(slot, slot.replace('oval 2 0.508', 'oval 3 0.508')).passed).toBe(false);
  });

  it('compares drill offsets after pad rotation and blocks plating differences', () => {
    const ref = tht.replace('(drill 0.508)', '(drill 0.508 (offset 0 -0.2))');
    const rotated = tht.replace('(at 0 0)', '(at 0 0 90)').replace('(drill 0.508)', '(drill 0.508 (offset 0.2 0))');
    expect(comparison(ref, rotated).passed).toBe(true);
    expect(comparison(ref, tht).passed).toBe(false);
    const generated = footprint(tht);
    generated.pads[0].plated = false;
    expect(compareFootprints(footprint(tht), generated).errors.some(e => e.field === 'plating')).toBe(true);
  });

  it('classifies NPTH only as holes, keeping unnamed plated vias separate', () => {
    const data = footprint(anchor, via, hole);
    expect(data.pads).toHaveLength(1);
    expect(data.vias).toHaveLength(1);
    expect(data.holes).toHaveLength(1);
    expect(data.holes[0].plated).toBe(false);
    expect(compareFootprints(data, footprint(anchor, hole, via)).passed).toBe(true);
  });

  it('fails missing, extra and moved same-count vias and mechanical holes', () => {
    const reference = footprint(anchor, via, hole);
    expect(compareFootprints(reference, footprint(anchor, hole)).passed).toBe(false);
    expect(compareFootprints(reference, footprint(anchor, via)).passed).toBe(false);
    expect(compareFootprints(reference, footprint(anchor, via, hole, via)).passed).toBe(false);
    expect(compareFootprints(reference, footprint(anchor, via, hole, hole)).passed).toBe(false);
    const moved = compareFootprints(reference, footprint(anchor, via.replace('(at 3 0)', '(at 4 0)'), hole.replace('(at -3 0)', '(at -4 0)')));
    expect(moved.viaCountMatch).toBe(true);
    expect(moved.holeCountMatch).toBe(true);
    expect(moved.errors.filter(e => e.field === 'position')).toHaveLength(2);
  });

  it('never validates an empty or hole-only footprint', () => {
    expect(compareFootprints(footprint(), footprint()).passed).toBe(false);
    expect(compareFootprints(footprint(hole), footprint(hole)).passed).toBe(false);
    expect(compareFootprints(extractFromReferenceSVG('<svg/>'), footprint()).errors.some(e => e.field === 'coverage')).toBe(true);
  });

  it('uses structural parsing for quoted/unquoted atoms and ignores nested fake pad text', () => {
    const data = extractFromKiCadFootprint(`(footprint "x\\\" (pad fake)" (property "note" "(pad 99 smd rect)") ${anchor})`);
    expect(compareFootprints(data, footprint(anchor)).passed).toBe(true);
    expect(data.pads[0].number).toBe('1');
    expect(compareFootprints(footprint(anchor), extractFromKiCadFootprint('(footprint "unterminated)')).passed).toBe(false);
  });

  it('compares custom polygon copper, not the tiny anchor or only its bounding box', () => {
    const custom = '(pad 1 smd custom (at 0 0) (size 0.01 0.01) (layers F.Cu) (options (anchor rect)) (primitives (gr_poly (pts (xy -1 -0.5) (xy 1 -0.5) (xy 1 0.5) (xy -1 0.5)) (width 0) (fill yes))))';
    const data = footprint(custom);
    expect(data.pads[0].width).toBe(2);
    expect(data.pads[0].height).toBe(1);
    expect(compareFootprints(footprint(anchor), data).passed).toBe(true);
    const notch = custom.replace('(xy 1 0.5)', '(xy 1 0.5) (xy 0.5 0.5) (xy 0.5 0.2) (xy 0.2 0.2) (xy 0.2 0.5)');
    expect(comparison(custom, notch).passed).toBe(false);
    expect(comparison(custom, custom.replace('(xy 1 -0.5)', '(xy 0.2 -0.5)')).passed).toBe(false);
  });

  it('preserves genuine circle/oval equivalence but not ellipse or rounded-corner shape differences', () => {
    const circle = '(pad 1 smd circle (at 0 0 37) (size 2 2) (layers F.Cu))';
    expect(comparison(circle, circle.replace('circle', 'oval').replace('0 0 37', '0 0 0')).passed).toBe(true);
    expect(comparison(circle, circle.replace('circle', 'oval').replace('size 2 2', 'size 2 1')).passed).toBe(false);
    const rounded = anchor.replace('smd rect', 'smd roundrect').replace('(layers F.Cu)', '(layers F.Cu) (roundrect_rratio 0.25)');
    expect(comparison(anchor, rounded).passed).toBe(false);
  });

  it('validates the exact capsule and circle primitives emitted for independently oriented slots', () => {
    const custom = (primitive: string) => `(pad 1 smd custom (at 0 0 30) (size 0.01 0.01) (layers F.Cu) (options (anchor circle)) (primitives ${primitive}))`;
    const capsule = '(pad 1 smd oval (at 0 0 30) (size 2 1) (layers F.Cu))';
    const line = '(gr_line (start -0.5 0) (end 0.5 0) (width 1))';
    expect(comparison(capsule, custom(line)).passed).toBe(true);
    expect(comparison(capsule, custom(line.replace('(width 1)', '(width 1.2)'))).passed).toBe(false);
    const circle = '(pad 1 smd circle (at 0 0 30) (size 2 2) (layers F.Cu))';
    const primitive = '(gr_circle (center 0 0) (end 1 0) (width 0) (fill yes))';
    expect(comparison(circle, custom(primitive)).passed).toBe(true);
    expect(comparison(circle, custom(primitive.replace('(fill yes)', '(fill no)'))).passed).toBe(false);
  });
});

describe('reference SVG manufacturing evidence', () => {
  it('uses copper rather than mask, declared dimensions or drill-circle extents', () => {
    const svg = referencePad('<rect c_padid="mask" layerid="7" x="-3" y="-3" width="6" height="6"/><rect x="-2" y="-1" width="4" height="2"/>', 'c_width="99" c_height="99"');
    const expected = anchor.replace('size 2 1', 'size 1.016 0.508');
    expect(compareFootprints(extractFromReferenceSVG(svg), footprint(expected)).passed).toBe(true);
  });

  it('preserves rendered rotation rather than blindly accepting swapped dimensions', () => {
    const svg = referencePad('<rect transform="rotate(30)" x="-2" y="-1" width="4" height="2"/>');
    const expected = anchor.replace('size 2 1', 'size 1.016 0.508').replace('(at 0 0)', '(at 0 0 -30)');
    expect(compareFootprints(extractFromReferenceSVG(svg), footprint(expected)).passed).toBe(true);
    expect(compareFootprints(extractFromReferenceSVG(svg), footprint(expected.replace('0 0 -30', '0 0 30'))).passed).toBe(false);
  });

  it('preserves slot length, diameter, offset and explicit plating', () => {
    const svg = referencePad('<circle cx="0" cy="0" r="5"/>', 'plated="Y"', '<polyline c_padhole="1" points="-1 0 3 0" stroke-width="2"/>');
    const expected = '(pad 1 thru_hole circle (at 0.254 0) (size 2.54 2.54) (drill oval 1.524 0.508 (offset -0.254 0)) (layers F.Cu))';
    const ref = extractFromReferenceSVG(svg);
    expect(compareFootprints(ref, footprint(expected)).passed).toBe(true);
    expect(compareFootprints(ref, footprint(expected.replace('1.524 0.508', '0.508 1.524'))).passed).toBe(false);
    expect(compareFootprints(ref, footprint(expected.replace('(offset -0.254 0)', '(offset 0 0)'))).passed).toBe(false);
  });

  it('does not fabricate a copper layer, drill absence or plating when metadata is unavailable', () => {
    const complete = referencePad('<circle cx="0" cy="0" r="5"/>', 'plated="Y"', '<circle c_padhole="1" cx="0" cy="0" r="1"/>');
    const generated = footprint('(pad 1 thru_hole circle (at 0 0) (size 2.54 2.54) (drill 0.508) (layers F.Cu))');
    expect(compareFootprints(extractFromReferenceSVG(complete), generated).passed).toBe(true);
    for (const incomplete of [complete.replace('layerid="1"', ''), complete.replace('plated="Y"', ''), complete.replace(/<circle c_padhole[^>]*\/>/, '')]) {
      const result = compareFootprints(extractFromReferenceSVG(incomplete), generated);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.field === 'coverage')).toBe(true);
    }
  });

  it('distinguishes a true ellipse from an equal-extents capsule', () => {
    const svg = referencePad('<ellipse cx="0" cy="0" rx="4" ry="2"/>');
    const capsule = '(pad 1 smd oval (at 0 0) (size 2.032 1.016) (layers F.Cu))';
    expect(compareFootprints(extractFromReferenceSVG(svg), footprint(capsule)).passed).toBe(false);
  });

  it('centers mixed electrical and non-plated source PADs using both copper envelopes', () => {
    const source = `<svg>
      <g c_partid="part_pad" number="1" c_origin="0,0" layerid="1">
        <rect x="-2" y="-1" width="4" height="2"/><circle c_padhole="1" cx="0" cy="0" r="0"/>
      </g>
      <g c_partid="part_pad" number="mount" c_origin="10,0" layerid="11" plated="N">
        <circle cx="10" cy="0" r="2"/><circle c_padhole="1" cx="10" cy="0" r="1"/>
      </g></svg>`;
    const generated = footprint(
      '(pad 1 smd rect (at -1.27 0) (size 1.016 0.508) (layers F.Cu))',
      '(pad mount np_thru_hole circle (at 1.27 0) (size 1.016 1.016) (drill 0.508) (layers "*.Cu"))',
    );
    expect(compareFootprints(extractFromReferenceSVG(source), generated).passed).toBe(true);
  });
});
