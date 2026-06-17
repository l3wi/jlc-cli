import { ZodError } from 'zod';

export interface ToolErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
}

export function jsonContent(payload: unknown) {
  return [{
    type: 'text' as const,
    text: JSON.stringify(payload),
  }];
}

export function toolError(
  code: string,
  message: string,
  options: { retryable?: boolean; details?: unknown } = {}
) {
  return {
    content: jsonContent({
      success: false,
      error: {
        code,
        message,
        retryable: options.retryable ?? false,
        details: options.details,
      },
    } satisfies ToolErrorPayload),
    isError: true,
  };
}

export function errorPayloadFromUnknown(error: unknown): ToolErrorPayload['error'] {
  if (error instanceof ZodError) {
    return {
      code: 'invalid_arguments',
      message: 'Invalid tool arguments',
      retryable: false,
      details: error.issues,
    };
  }

  return {
    code: 'tool_error',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}
