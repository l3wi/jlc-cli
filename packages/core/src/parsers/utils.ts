/**
 * Shared parsing utilities for EasyEDA data
 */

/**
 * Parse boolean from EasyEDA format
 * Empty string = false, "0" = false, any other value = true
 */
export function parseBool(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0';
}

/**
 * Safely parse float with default value
 */
export function safeParseFloat(value: string | undefined, defaultValue = 0): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely parse int with default value
 */
export function safeParseInt(value: string | undefined, defaultValue = 0): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
