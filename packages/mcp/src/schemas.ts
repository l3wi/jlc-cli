/**
 * Shared validation schemas for MCP tools
 * Re-exports from @jlcpcb/core for consistency across packages
 */

export {
  LCSCPartNumberSchema,
  LCSCPartNumberSchema as LcscIdSchema, // Alias for backwards compatibility
  EasyEDAUuidSchema,
  ComponentIdSchema,
  SafePathSchema,
  isLcscId,
  isEasyEDAUuid,
} from '@jlcpcb/core';
