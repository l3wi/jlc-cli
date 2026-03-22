import type { ComponentSearchResult } from '@jlcpcb/core';
import {
  padEndToWidth,
  padStartToWidth,
  truncateToWidth,
} from './table-text.js';

export interface ListViewColumnWidths {
  mfrPartWidth: number;
  descWidth: number;
  pkgWidth: number;
  stockWidth: number;
  priceWidth: number;
  libraryWidth: number;
}

export function formatStock(stock: number): string {
  if (stock < 1000) return String(stock);
  return '>1k';
}

export function truncate(str: string, len: number): string {
  return truncateToWidth(str, len);
}

export function getListViewColumnWidths(terminalWidth: number): ListViewColumnWidths {
  const minWidth = 80;
  const availableWidth = Math.max(terminalWidth - 4, minWidth);

  const mfrPartWidth = 18;
  const pkgWidth = 10;
  const stockWidth = 6;
  const priceWidth = 8;
  const libraryWidth = 10;
  const fixedWidth =
    mfrPartWidth + pkgWidth + stockWidth + priceWidth + libraryWidth + 4;

  return {
    mfrPartWidth,
    descWidth: Math.max(availableWidth - fixedWidth, 15),
    pkgWidth,
    stockWidth,
    priceWidth,
    libraryWidth,
  };
}

export function formatListHeader(widths: ListViewColumnWidths): string {
  return (
    '  ' +
    padEndToWidth('MFR.Part', widths.mfrPartWidth) +
    padEndToWidth('Description', widths.descWidth) +
    padEndToWidth('Package', widths.pkgWidth) +
    padStartToWidth('Stock', widths.stockWidth) +
    padStartToWidth('Price', widths.priceWidth) +
    '  ' +
    padEndToWidth('Library', widths.libraryWidth)
  );
}

export function formatListRow(
  result: ComponentSearchResult,
  widths: ListViewColumnWidths
): {
  mfrPart: string;
  desc: string;
  pkg: string;
  stock: string;
  price: string;
  library: string;
  libraryLabel: string;
  libraryColor: 'green' | 'yellow';
} {
  const libraryLabel = result.libraryType === 'basic' ? 'Basic' : 'Extended';

  return {
    mfrPart: padEndToWidth(
      truncate(result.name || '', widths.mfrPartWidth - 1),
      widths.mfrPartWidth
    ),
    desc: padEndToWidth(
      truncate(result.description || '', widths.descWidth - 1),
      widths.descWidth
    ),
    pkg: padEndToWidth(
      truncate(result.package || '', widths.pkgWidth - 1),
      widths.pkgWidth
    ),
    stock: padStartToWidth(formatStock(result.stock || 0), widths.stockWidth),
    price: result.price
      ? padStartToWidth(`$${result.price.toFixed(2)}`, widths.priceWidth)
      : padStartToWidth('N/A', widths.priceWidth),
    library: padEndToWidth(libraryLabel, widths.libraryWidth),
    libraryLabel,
    libraryColor: result.libraryType === 'basic' ? 'green' : 'yellow',
  };
}
