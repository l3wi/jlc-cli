import type { InstalledComponent } from '@jlcpcb/core';

import {
  padEndToWidth,
  truncateToWidth,
} from './table-text.js';

export interface LibraryTableWidths {
  nameWidth: number;
  categoryWidth: number;
  descWidth: number;
  symWidth: number;
  fpWidth: number;
  modelWidth: number;
}

export function getLibraryTableWidths(terminalWidth: number): LibraryTableWidths {
  const nameWidth = 20;
  const categoryWidth = 12;
  const symWidth = 5;
  const fpWidth = 5;
  const modelWidth = 5;
  const descWidth = Math.max(
    terminalWidth - 2 - nameWidth - categoryWidth - symWidth - fpWidth - modelWidth,
    15
  );

  return {
    nameWidth,
    categoryWidth,
    descWidth,
    symWidth,
    fpWidth,
    modelWidth,
  };
}

export function formatLibraryHeader(widths: LibraryTableWidths): string {
  return (
    '  ' +
    padEndToWidth('Name', widths.nameWidth) +
    padEndToWidth('Category', widths.categoryWidth) +
    padEndToWidth('Description', widths.descWidth) +
    padEndToWidth('Sym', widths.symWidth) +
    padEndToWidth('FP', widths.fpWidth) +
    padEndToWidth('3D', widths.modelWidth)
  );
}

export function formatLibraryRow(
  item: InstalledComponent,
  description: string,
  widths: LibraryTableWidths
): {
  name: string;
  category: string;
  description: string;
  sym: string;
  fp: string;
  model: string;
  fpColor: 'red' | 'cyan' | 'green';
  modelColor: 'red' | 'green';
} {
  const isStandardFp =
    item.footprintRef && !item.footprintRef.startsWith('JLC-MCP:');
  const fpLabel = !item.footprintRef ? 'N' : isStandardFp ? 'S' : 'Y';

  return {
    name: padEndToWidth(
      truncateToWidth(item.name, widths.nameWidth - 1),
      widths.nameWidth
    ),
    category: padEndToWidth(
      truncateToWidth(item.category, widths.categoryWidth - 1),
      widths.categoryWidth
    ),
    description: padEndToWidth(
      truncateToWidth(description, widths.descWidth - 1),
      widths.descWidth
    ),
    sym: padEndToWidth('Y', widths.symWidth),
    fp: padEndToWidth(fpLabel, widths.fpWidth),
    model: padEndToWidth(item.has3dModel ? 'Y' : 'N', widths.modelWidth),
    fpColor: !item.footprintRef ? 'red' : isStandardFp ? 'cyan' : 'green',
    modelColor: item.has3dModel ? 'green' : 'red',
  };
}
