import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('LibraryService agent-safe install flow', () => {
  it('checks for existing symbols before model and footprint artifact writes', () => {
    const source = readFileSync(join(import.meta.dir, 'library-service.ts'), 'utf-8');

    const firstExistsReturn = source.indexOf("symbolAction: 'exists'");
    const firstModelDownload = source.indexOf('get3DModel(');
    const firstFootprintWrite = source.indexOf('await writeText(footprintPath');

    expect(firstExistsReturn).toBeGreaterThan(-1);
    expect(firstModelDownload).toBeGreaterThan(-1);
    expect(firstFootprintWrite).toBeGreaterThan(-1);
    expect(firstExistsReturn).toBeLessThan(firstModelDownload);
    expect(firstExistsReturn).toBeLessThan(firstFootprintWrite);
  });
});
