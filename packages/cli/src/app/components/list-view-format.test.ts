import { describe, expect, it } from 'bun:test';

import type { ComponentSearchResult } from '@jlcpcb/core';

import {
  formatListHeader,
  formatListRow,
  getListViewColumnWidths,
} from './list-view-format.js';
import { measureTextWidth } from './table-text.js';

function createResult(
  overrides: Partial<ComponentSearchResult>
): ComponentSearchResult {
  return {
    lcscId: 'C123',
    name: 'LM2940CT-5.0/NOPB',
    description:
      '1 150uVrms 1A 26V 30mA 500mV@(1A) 5V 72dB@(120Hz) Fixed Positive Under Voltage Lockout',
    package: 'TO-220',
    manufacturer: 'TI',
    stock: 28,
    price: 1.01,
    libraryType: 'extended',
    ...overrides,
  };
}

describe('list-view-format', () => {
  it('formats header and rows to deterministic widths', () => {
    const widths = getListViewColumnWidths(120);
    const header = formatListHeader(widths);
    const extendedRow = formatListRow(createResult({ libraryType: 'extended' }), widths);
    const basicRow = formatListRow(createResult({ libraryType: 'basic' }), widths);

    const render = (row: ReturnType<typeof formatListRow>) =>
      '  ' + row.mfrPart + row.desc + row.pkg + row.stock + row.price + '  ' + row.library;

    expect(measureTextWidth(header)).toBe(measureTextWidth(render(extendedRow)));
    expect(measureTextWidth(render(extendedRow))).toBe(
      measureTextWidth(render(basicRow))
    );
    expect(measureTextWidth(extendedRow.library)).toBe(widths.libraryWidth);
    expect(measureTextWidth(basicRow.library)).toBe(widths.libraryWidth);
  });

  it('truncates and pads by display width for wide characters', () => {
    const widths = getListViewColumnWidths(60);
    const row = formatListRow(
      createResult({
        name: '电源模块-REGULATOR',
        description: '宽字符 mixed description',
      }),
      widths
    );

    expect(measureTextWidth(row.mfrPart)).toBe(widths.mfrPartWidth);
    expect(measureTextWidth(row.desc)).toBe(widths.descWidth);
  });
});
