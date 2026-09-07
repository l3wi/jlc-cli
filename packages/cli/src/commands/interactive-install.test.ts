import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('interactive install artifacts', () => {
  for (const [scenario, behavior] of [
    ['lcsc', 'reinstalls the selected LCSC project artifact with downloaded 3D bytes through no-ID search'],
    ['community', 'ignores global community installation status and installs/reinstalls locally without 3D through no-ID search'],
  ]) {
    it(behavior, () => {
      // Core services and Ink are real; only upstream clients and terminal/prompt IO are substituted.
      const root = mkdtempSync(join(tmpdir(), 'jlc-interactive-install-'));
      try {
        const result = spawnSync(process.execPath, [
          join(import.meta.dir, '../app/__fixtures__/interactive-install-scenarios.tsx'), scenario, root,
        ], {
          encoding: 'utf8',
          timeout: 15_000,
          env: { ...process.env, HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), XDG_CONFIG_HOME: join(root, 'config') },
        });
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 20_000);
  }
});
