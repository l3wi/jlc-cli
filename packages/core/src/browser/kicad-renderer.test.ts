import { describe, expect, it } from 'bun:test';

import { renderFootprintSvg, renderSymbolSvg } from './kicad-renderer.js';

// Parse the public SVG output, rather than pinning source code or serialized markup.
async function elements(svg: string, selector: string) {
  const found: Array<{ attrs: Record<string, string>; text: string }> = [];
  await new HTMLRewriter().on(selector, {
    element(element) {
      found.push({ attrs: Object.fromEntries(element.attributes), text: '' });
    },
    text(chunk) {
      found[found.length - 1].text += chunk.text;
    },
  }).transform(new Response(svg)).text();
  return found;
}

function placedPoint(attrs: Record<string, string>, x: number, y: number) {
  const translate = attrs.transform?.match(/translate\(([-\d.e+]+)[ ,]+([-\d.e+]+)\)/);
  const rotate = attrs.transform?.match(/rotate\(([-\d.e+]+)\)/);
  const angle = Number(rotate?.[1] ?? 0) * Math.PI / 180;
  return {
    x: Number(translate?.[1] ?? 0) + x * Math.cos(angle) - y * Math.sin(angle),
    y: Number(translate?.[2] ?? 0) + x * Math.sin(angle) + y * Math.cos(angle),
  };
}

describe('KiCad preview geometry', () => {
  it('renders pad and drill ovals as capsules, rotating copper offsets around the drill centre', async () => {
    const svg = renderFootprintSvg(`(footprint "probe"
      (pad "1" thru_hole oval (at 0 5 30) (size 4 2)
        (drill oval 2 1 (offset 0.5 0)) (layers "*.Cu" "*.Mask")))`);
    const rectangles = await elements(svg, '[data-pad="1"] rect');
    expect(rectangles).toHaveLength(2);
    expect(await elements(svg, 'ellipse')).toHaveLength(0);
    const copper = rectangles[0].attrs, drill = rectangles[1].attrs;
    expect(Number(copper.rx)).toBe(1);
    expect(Number(drill.rx)).toBe(0.5);
    expect(placedPoint(copper, 0, 0).x).toBeCloseTo(Math.sqrt(3) / 4);
    expect(placedPoint(copper, 0, 0).y).toBeCloseTo(4.75);
    expect(placedPoint(copper, 1, 0).y).toBeCloseTo(4.25);
    expect(placedPoint(drill, 0, 0)).toEqual({ x: 0, y: 5 });
    expect(placedPoint(drill, 1, 0).y).toBeCloseTo(4.5);
  });

  it('preserves the union of a custom anchor, stroked line and filled circle under rotation', async () => {
    const svg = renderFootprintSvg(`(footprint "custom"
      (pad "" smd custom (at 3 4 90) (size 0.2 0.2) (layers "F.Cu")
        (options (anchor rect))
        (primitives
          (gr_line (start -2 0) (end 2 0) (width 2))
          (gr_circle (center 0 3) (end 2 3) (width 0) (fill yes)))))`);
    const line = (await elements(svg, 'line'))[0].attrs;
    expect(Number(line.x1)).toBeCloseTo(3);
    expect(Number(line.y1)).toBeCloseTo(6);
    expect(Number(line.x2)).toBeCloseTo(3);
    expect(Number(line.y2)).toBeCloseTo(2);
    expect(Number(line['stroke-width'])).toBe(2);
    expect(line['stroke-linecap']).toBe('round');
    const circle = (await elements(svg, 'circle'))[0].attrs;
    expect(Number(circle.cx)).toBeCloseTo(6);
    expect(Number(circle.cy)).toBeCloseTo(4);
    expect(Number(circle.r)).toBe(2);
    expect(circle.fill).toBe(line.stroke);
    expect(await elements(svg, 'rect')).toHaveLength(1);
    const viewBox = (await elements(svg, 'svg'))[0].attrs.viewbox.split(' ').map(Number);
    expect(viewBox).toEqual([1, 0, 8, 8]);
  });

  it('keeps custom pad numbers legible when a tiny anchor belongs to a larger copper shape', async () => {
    const svg = renderFootprintSvg(`(footprint "label"
      (pad "2" smd custom (at 4 0) (size 0.01 0.01) (layers "F.Cu")
        (options (anchor rect))
        (primitives (gr_line (start -1 0) (end 1 0) (width 2)))))`);
    const label = (await elements(svg, '[data-pad="2"] text'))[0];
    expect(label.text).toBe('2');
    expect(Number(label.attrs['font-size'])).toBeGreaterThan(0.01);
    expect(Number(label.attrs['font-size'])).toBeLessThanOrEqual(2);
    expect(Number(label.attrs.x)).toBe(4);
    expect(Number(label.attrs.y)).toBe(0);
  });

  it('uses the full roundrect ratio and bounds rotated copper including its stroke', async () => {
    const svg = renderFootprintSvg(`(footprint "rounded"
      (pad "" smd roundrect (at 0 0 90) (size 8 2) (roundrect_rratio 0.25) (layers "F.Cu")))`);
    const rect = (await elements(svg, 'rect'))[0].attrs;
    expect(Number(rect.rx)).toBe(0.5);
    const viewBox = (await elements(svg, 'svg'))[0].attrs.viewbox.split(' ').map(Number);
    expect(viewBox[0]).toBeCloseTo(-2);
    expect(viewBox[1]).toBeCloseTo(-5);
    expect(viewBox[2]).toBeCloseTo(4);
    expect(viewBox[3]).toBeCloseTo(10);
  });

  it('passes through arc midpoints in either direction, retaining major arcs and cardinal bounds', async () => {
    for (const [mid, end, sweep] of [['-5 0', '0 5', 0], ['0 5', '-5 0', 1]] as const) {
      const svg = renderFootprintSvg(`(footprint "arc"
        (fp_arc (start 5 0) (mid ${mid}) (end ${end}) (stroke (width 2)) (layer "F.SilkS")))`);
      const path = (await elements(svg, 'path'))[0].attrs.d.split(' ');
      expect(Number(path[4])).toBeCloseTo(5);
      expect(Number(path[7])).toBe(mid === '-5 0' ? 1 : 0);
      expect(Number(path[8])).toBe(sweep);
      const viewBox = (await elements(svg, 'svg'))[0].attrs.viewbox.split(' ').map(Number);
      expect(viewBox[0]).toBeCloseTo(-7);
      expect(viewBox[2]).toBeCloseTo(14);
      expect(viewBox[1]).toBeCloseTo(mid === '-5 0' ? -7 : -2);
      expect(viewBox[3]).toBeCloseTo(mid === '-5 0' ? 14 : 9);
    }
  });

  it('shows footprint properties and rule areas without exposing hidden manufacturing metadata', async () => {
    const svg = renderFootprintSvg(`(footprint "labels"
      (property "Reference" "REF**" (at 0 -2) (layer "F.SilkS") (effects (font (size 1 1))))
      (property "Value" "Connector" (at 0 2) (layer "F.Fab") (effects (font (size 1 1))))
      (property "Private" "hidden" (at 999 999) (layer "F.Fab") hide)
      (fp_text user "\${REFERENCE}" (at 0 0 90) (layer "F.Fab") (effects (font (size 1 1))))
      (fp_text user "also hidden" (at 999 999) hide (effects (font (size 1 1))))
      (zone (layer "F.Cu") (keepout (copperpour not_allowed) (pads allowed))
        (polygon (pts (xy -2 -1) (xy 2 -1) (xy 2 1) (xy -2 1)))))`);
    expect((await elements(svg, 'tspan')).map(e => e.text)).toEqual(['REF**', 'Connector', 'REF**']);
    const polygon = (await elements(svg, '[data-rule-area] polygon'))[0].attrs;
    expect(polygon['stroke-dasharray']).toBeDefined();
    expect(Number(polygon['fill-opacity'])).toBeLessThan(1);
    expect((await elements(svg, 'title'))[0].text).toContain('copperpour prohibited');
    const viewBox = (await elements(svg, 'svg'))[0].attrs.viewbox.split(' ').map(Number);
    expect(viewBox[2]).toBeLessThan(20);
    expect(viewBox[3]).toBeLessThan(20);
  });

  it('renders symbol decorative text, outline fills, and pin display effects', async () => {
    const svg = renderSymbolSvg(`(symbol "annotations" (pin_numbers hide) (pin_names (offset 0.5))
      (symbol "annotations_0_1"
        (polyline (pts (xy 0 0) (xy 2 0) (xy 0 2) (xy 0 0)) (stroke (width 0.2)) (fill (type outline)))
        (text "Decorative" (at 2 2 90) (effects (font (size 1.5 1.5))))
        (text "secret" (at 999 999) (effects hide))
        (pin input inverted_clock (at -3 0 0) (length 3)
          (name "CLK" (effects (font (size 0.6 0.6))))
          (number "1" (effects (font (size 0.7 0.7)))))))`);
    expect((await elements(svg, 'tspan')).map(e => e.text)).toEqual(['Decorative', 'CLK']);
    const text = await elements(svg, 'text');
    expect(Number(text[0].attrs['font-size'])).toBe(1.5);
    expect(Number(text[1].attrs['font-size'])).toBe(0.6);
    const filled = (await elements(svg, 'polyline'))[0].attrs;
    expect(filled.fill).toBe(filled.stroke);
    expect(await elements(svg, 'circle')).toHaveLength(1);
    expect(await elements(svg, 'polyline')).toHaveLength(2);
    const line = (await elements(svg, 'line'))[0].attrs;
    expect(Number(line.x2)).toBeCloseTo(-0.6);
  });

  it('reports unsupported custom copper rather than fabricating a pad from its anchor', async () => {
    const svg = renderFootprintSvg(`(footprint "unsupported"
      (pad "1" smd custom (at 0 0) (size 0.01 0.01) (layers "F.Cu")
        (options (anchor circle)) (primitives (gr_curve (pts (xy 0 0) (xy 1 1))))))`);
    expect((await elements(svg, 'text'))[0].text).toContain('Unsupported footprint geometry: gr_curve');
    expect(await elements(svg, '[data-pad]')).toHaveLength(0);
  });
});
