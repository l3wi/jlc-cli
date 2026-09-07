import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function run(scenario: string) {
  // Isolate module mocks and process.exit from other CLI/core tests.
  return spawnSync(process.execPath, [join(import.meta.dir, '__fixtures__/failure-scenarios.ts'), scenario], {
    encoding: 'utf8',
    timeout: 15_000,
  });
}

describe('command failure exit status', () => {
  it('reports failed regenerations and exits unsuccessfully', () => {
    const result = run('regenerate');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('C123');
    expect(result.stdout).toContain('conversion failed');
  });

  it('does not pass absent requested reference SVGs in JSON', () => {
    const result = run('missing');
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: false,
      result: { passed: false, error: expect.stringContaining('footprint, symbol') },
    });
  });

  it('reports absent requested references in text', () => {
    const result = run('text-missing');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Missing reference SVG: footprint, symbol');
  });

  it('counts missing references as batch errors instead of passes', () => {
    const result = run('batch-missing');
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: false,
      summary: { total: 1, passed: 0, failed: 0, errors: 1 },
    });
  });

  it('allows an absent footprint reference when its check was disabled', () => {
    const result = run('disabled-footprint');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      result: { passed: true, footprint: null, symbol: { passed: true } },
    });
  });

  it('rejects symbol pin displacement through the real comparator', () => {
    const result = run('symbol-moved');
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    expect(output.result.symbol.errors.some((e: { field: string }) => e.field === 'position')).toBe(true);
  });

  it('does not pass symbol pins with unknown reference direction', () => {
    const result = run('symbol-unverified');
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    expect(output.result.symbol.errors.some((e: { field: string }) => e.field === 'coverage')).toBe(true);
  });

  it('rejects a manufacturing position mismatch through the real comparator', () => {
    const result = run('footprint-moved');
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    expect(output.result.footprint.errors.some((e: { field: string }) => e.field === 'position')).toBe(true);
  });

  it('does not claim success for an unverified reference copper layer', () => {
    const result = run('footprint-unverified');
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    expect(output.result.footprint.errors.some((e: { field: string }) => e.field === 'coverage')).toBe(true);
  });

  it('validates matching, fully described manufacturing geometry', () => {
    const result = run('footprint-matching');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      result: { passed: true, footprint: { passed: true, errors: [] } },
    });
  });

  it.each(['mpn', 'package'])('rejects a changed fixture %s during batch validation', (field) => {
    const result = run(`footprint-identity-${field}`);
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      success: false,
      summary: { total: 1, passed: 0, failed: 0, errors: 1 },
    });
    expect(output.results[0].error).toMatch(field === 'mpn' ? /Fixture MPN differs/ : /Fixture package differs/);
  });
});
