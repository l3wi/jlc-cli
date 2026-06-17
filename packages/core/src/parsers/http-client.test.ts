import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('fetchWithCurlFallback transport safety', () => {
  it('uses execFileSync argument arrays instead of shell-joined execSync', () => {
    const source = readFileSync(join(import.meta.dir, 'http-client.ts'), 'utf-8');

    expect(source).toContain('execFileSync');
    expect(source).not.toContain('execSync');
    expect(source).not.toContain("curlArgs.join(' ')");
    expect(source).not.toContain('curlArgs.join(" ")');
  });
});
