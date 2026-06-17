import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

import { componentSearchTool } from './search.js';
import { toolHandlers, tools } from './index.js';
import { errorPayloadFromUnknown, toolError } from '../tool-response.js';

describe('agent-facing MCP contracts', () => {
  it('returns structured JSON errors', () => {
    const response = toolError('example_code', 'Example message', {
      retryable: true,
      details: { id: 'C123' },
    });

    expect(response.isError).toBe(true);
    const payload = JSON.parse(response.content[0].text);
    expect(payload).toEqual({
      success: false,
      error: {
        code: 'example_code',
        message: 'Example message',
        retryable: true,
        details: { id: 'C123' },
      },
    });
  });

  it('documents discriminated search source and result identity', () => {
    const source = componentSearchTool.inputSchema.properties?.source;

    expect(source).toMatchObject({
      enum: ['lcsc', 'community', 'all'],
    });
    expect(componentSearchTool.description).toContain('discriminated IDs');
  });

  it('does not reference removed library_fetch tool guidance', () => {
    const files = ['library-fix.ts', 'library-update.ts'].map((file) =>
      readFileSync(join(import.meta.dir, file), 'utf-8')
    );

    expect(files.join('\n')).not.toContain('library_fetch');
  });

  it('has a structured invalid-input contract for every registered tool', async () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      const handler = toolHandlers[tool.name];
      expect(handler).toBeDefined();

      let rejectedInvalidInput = false;
      try {
        await handler(undefined);
      } catch (error) {
        rejectedInvalidInput = true;
        const payload = errorPayloadFromUnknown(error);
        expect(payload).toHaveProperty('code');
        expect(payload).toHaveProperty('message');
        expect(payload).toHaveProperty('retryable');
      }
      expect(rejectedInvalidInput).toBe(true);
    }
  });
});
