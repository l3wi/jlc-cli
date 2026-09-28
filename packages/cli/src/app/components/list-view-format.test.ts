import { describe, expect, it } from 'bun:test';

import type { ComponentSearchResult } from '@jlcpcb/core';

import {
  formatListHeader,
  formatListRow,
  getListViewColumnWidths,
  type ListViewRow,
} from './list-view-format.js';
import { measureTextWidth } from './table-text.js';

function createResult(
  overrides: Partial<ComponentSearchResult>
): ComponentSearchResult {
  return {
    id: 'C123',
    idType: 'lcsc',
    lcscId: 'C123',
    name: 'LM2940CT-5.0/NOPB',
    description:
      '1 150uVrms 1A 26V 30mA 500mV@(1A) 5V 72dB@(120Hz) Fixed Positive Under Voltage Lockout',
    package: 'TO-220',
    manufacturer: 'TI',
    stock: 28,
    price: 1.01,
    libraryType: 'extended',
    pcbaType: 'economic-and-standard',
    ...overrides,
  };
}

describe('list-view-format', () => {
  it('formats header and rows to deterministic widths', () => {
    const widths = getListViewColumnWidths(120);
    const header = formatListHeader(widths);
    const extendedRow = formatListRow(createResult({ libraryType: 'extended' }), widths);
    const basicRow = formatListRow(createResult({ libraryType: 'basic' }), widths);

    const render = (row: ListViewRow) =>
      '  ' + row.mfrPart + row.desc + row.pkg + row.stock + row.price + '  ' + row.library + row.pcba;

    expect(measureTextWidth(header)).toBe(measureTextWidth(render(extendedRow)));
    expect(measureTextWidth(render(extendedRow))).toBe(
      measureTextWidth(render(basicRow))
    );
    expect(measureTextWidth(extendedRow.library)).toBe(widths.libraryWidth);
    expect(measureTextWidth(basicRow.library)).toBe(widths.libraryWidth);
    expect(measureTextWidth(basicRow.pcba)).toBe(widths.pcbaWidth);
  });

  it('flags Standard Only parts and stays aligned in the PCBA column', () => {
    const widths = getListViewColumnWidths(120);

    const standardOnly = formatListRow(
      createResult({ pcbaType: 'standard-only' }),
      widths
    );
    const both = formatListRow(
      createResult({ pcbaType: 'economic-and-standard' }),
      widths
    );

    expect(standardOnly.pcbaLabel).toBe('Std Only');
    expect(both.pcbaLabel).toBe('Econ+Std');
    expect(measureTextWidth(standardOnly.pcba)).toBe(widths.pcbaWidth);
    expect(measureTextWidth(both.pcba)).toBe(widths.pcbaWidth);
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
