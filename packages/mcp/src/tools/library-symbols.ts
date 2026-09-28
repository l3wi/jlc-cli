import fs from 'fs';
import { join } from 'path';
import { childExpressions, symbolConverter, type EasyEDAComponentData } from '@jlcpcb/core';

export interface LibrarySymbol {
  start: number;
  end: number;
  name: string;
  nameAtom: string;
  lcscId?: string;
}

// Match only a symbol's opening atom; structural boundaries come from childExpressions.
const symbolHeader = /^(\(\s*symbol\s+)("((?:\\[\s\S]|[^"\\])*)")/;
const unescapeAtom = (value: string): string => value.replace(/\\([\s\S])/g, '$1');

/** Keep source ranges so unrelated symbols and library metadata survive refreshes verbatim. */
export function readLibrarySymbols(content: string): LibrarySymbol[] {
  if (!/^\s*\(\s*kicad_symbol_lib\b/.test(content)) {
    throw new Error('Invalid symbol library');
  }
  const symbols: LibrarySymbol[] = [];
  for (const { start, end } of childExpressions(content)) {
    const entry = content.slice(start, end);
    const header = symbolHeader.exec(entry);
    if (!header) continue;
    let lcscId: string | undefined;
    for (const propertyRange of childExpressions(entry)) {
      const property = entry.slice(propertyRange.start, propertyRange.end)
        .match(/^\(\s*property\s+"((?:\\[\s\S]|[^"\\])*)"\s+"((?:\\[\s\S]|[^"\\])*)"/);
      if (property && unescapeAtom(property[1]) === 'LCSC') {
        const value = unescapeAtom(property[2]);
        if (/^C\d+$/.test(value)) lcscId = value;
      }
    }
    symbols.push({ start, end, name: unescapeAtom(header[3]), nameAtom: header[2], lcscId });
  }
  return symbols;
}

/** A missing directory is empty; an unreadable directory must never trigger initialization. */
export function findJlcLibraries(symbolsDir: string): string[] {
  try {
    return fs.readdirSync(symbolsDir)
      .filter((file) => file.startsWith('JLC-MCP-') && file.endsWith('.kicad_sym'))
      .map((file) => join(symbolsDir, file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Restore trusted installed identity after conversion, without relaxing converter sanitization. */
export function regenerateInstalledSymbol(component: EasyEDAComponentData, installed: LibrarySymbol): string {
  const generated = symbolConverter.convertToSymbolEntry(component, { symbolName: installed.name }).trim();
  const header = symbolHeader.exec(generated);
  if (!header) throw new Error('Invalid generated symbol');
  const generatedName = unescapeAtom(header[3]);
  const parts = [header[1], installed.nameAtom];
  let offset = header[0].length;
  for (const { start, end } of childExpressions(generated)) {
    const unit = symbolHeader.exec(generated.slice(start, end));
    if (!unit) continue;
    const unitName = unescapeAtom(unit[3]);
    const suffix = unitName.slice(generatedName.length);
    if (!unitName.startsWith(generatedName) || !/^_\d+_\d+$/.test(suffix)) {
      throw new Error('Invalid generated symbol unit identity');
    }
    parts.push(generated.slice(offset, start), unit[1], installed.nameAtom.slice(0, -1), suffix, '"');
    offset = start + unit[0].length;
  }
  parts.push(generated.slice(offset));
  return parts.join('');
}
