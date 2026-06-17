export interface JsonError {
  success: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printJsonError(
  code: string,
  message: string,
  options: { retryable?: boolean; details?: unknown } = {}
): void {
  const payload: JsonError = {
    success: false,
    error: {
      code,
      message,
      retryable: options.retryable ?? false,
      details: options.details,
    },
  };

  printJson(payload);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
