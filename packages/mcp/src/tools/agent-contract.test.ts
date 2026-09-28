import { describe, expect, it } from 'bun:test';

import { componentSearchTool } from './search.js';
import { dispatchToolCall, tools } from './index.js';
import { toolError } from '../tool-response.js';

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
  });


  it('rejects omitted required arguments with structured validation errors', async () => {
    for (const tool of tools.filter((tool) => tool.inputSchema.required?.length)) {
      const response = await dispatchToolCall(tool.name);
      expect(response.isError).toBe(true);
      expect(JSON.parse(response.content[0].text)).toMatchObject({
        success: false,
        error: { code: 'invalid_arguments', retryable: false },
      });
    }
  });
});
