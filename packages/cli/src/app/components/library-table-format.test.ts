import { describe, expect, it } from 'bun:test';

import type { InstalledComponent } from '@jlcpcb/core';

import {
  formatLibraryHeader,
  formatLibraryRow,
  getLibraryTableWidths,
} from './library-table-format.js';
import { measureTextWidth } from './table-text.js';

function createInstalledComponent(
  overrides: Partial<InstalledComponent>
): InstalledComponent {
  return {
    lcscId: 'C123',
    name: 'LM2940CT-5.0/NOPB',
    category: 'Power',
    symbolRef: 'JLC-MCP:LM2940CT-5.0/NOPB',
    footprintRef: 'JLC-MCP:TO-220',
    library: 'JLC-MCP',
    has3dModel: true,
    ...overrides,
  };
}

describe('library-table-format', () => {
  it('formats header and rows to deterministic widths', () => {
    const widths = getLibraryTableWidths(120);
    const header = formatLibraryHeader(widths);
    const with3d = formatLibraryRow(
      createInstalledComponent({ has3dModel: true }),
      '宽字符 description',
      widths
    );
    const without3d = formatLibraryRow(
      createInstalledComponent({ has3dModel: false, footprintRef: undefined }),
      'plain description',
      widths
    );

    const render = (row: ReturnType<typeof formatLibraryRow>) =>
      '  ' +
      row.name +
      row.category +
      row.description +
      row.sym +
      row.fp +
      row.model;

    expect(measureTextWidth(header)).toBe(measureTextWidth(render(with3d)));
    expect(measureTextWidth(render(with3d))).toBe(
      measureTextWidth(render(without3d))
    );
    expect(measureTextWidth(with3d.model)).toBe(widths.modelWidth);
    expect(measureTextWidth(without3d.fp)).toBe(widths.fpWidth);
  });
});
