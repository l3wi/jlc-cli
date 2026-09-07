import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('interactive navigation', () => {
  for (const [scenario, behavior] of [
    ['filter-back', 'preserves search constraints and filtered results across detail/back navigation'],
    ['setup-escape', 'pops setup once on Escape'],
    ['setup-complete-escape', 'returns to details on Escape after successful setup and install'],
    ['setup-complete-key', 'returns to details on an ordinary key after successful setup and install'],
    ['setup-pending-back', 'does not navigate after abandoned setup resolves'],
    ['installed-escape', 'pops completion once on Escape'],
    ['installed-key', 'retains ordinary-key completion navigation'],
  ]) {
    it(behavior, () => {
      // Each real Ink render gets isolated services, module state and terminal streams.
      const result = spawnSync(process.execPath, [join(import.meta.dir, '__fixtures__/navigation-scenarios.tsx'), scenario], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    }, 20_000);
  }
});
