/**
 * Schema validation helpers using Zod
 */

import { z } from 'zod';

// Component ID validation schemas
export const LCSCPartNumberSchema = z.string().regex(/^C\d+$/, 'Invalid LCSC part number format (expected C followed by digits)');

/**
 * EasyEDA community component UUID validation
 * Format: 32-character hex string (case-insensitive, normalized to lowercase)
 */
export const EasyEDAUuidSchema = z
  .string()
  .regex(/^[a-f0-9]{32}$/i, 'Invalid EasyEDA UUID (expected 32-character hex string)')
  .transform((s) => s.toLowerCase());

/**
 * Component ID that accepts either LCSC part number or EasyEDA UUID
 */
export const ComponentIdSchema = z.union([LCSCPartNumberSchema, EasyEDAUuidSchema]);

/**
 * Safe path validation - prevents path traversal attacks
 */
export const SafePathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .refine((p) => !p.includes('..'), 'Path traversal (..) not allowed')
  .refine((p) => !p.includes('\0'), 'Null bytes not allowed in path');

export const PackageSchema = z.string().min(1, 'Package cannot be empty');

export const PriceTierSchema = z.object({
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  currency: z.string().default('USD'),
});

export const ComponentSchema = z.object({
  lcscPartNumber: LCSCPartNumberSchema,
  manufacturerPart: z.string().min(1),
  manufacturer: z.string().min(1),
  description: z.string(),
  category: z.string(),
  subcategory: z.string(),
  package: PackageSchema,
  stock: z.number().nonnegative(),
  price: z.array(PriceTierSchema),
  datasheet: z.string().url().optional(),
});

// Project validation schemas
export const BoardSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['mm', 'inch']).default('mm'),
});

export const PowerSourceSchema = z.object({
  type: z.enum(['usb', 'battery', 'dc_jack', 'poe', 'other']),
  voltage: z.object({
    min: z.number(),
    max: z.number(),
  }),
  current: z.number().positive().optional(),
  details: z.string().optional(),
});

export const DesignConstraintsSchema = z.object({
  boardSize: BoardSizeSchema.optional(),
  layers: z.number().min(1).max(32).default(2),
  powerSource: PowerSourceSchema,
  interfaces: z.array(z.object({
    type: z.string(),
    count: z.number().positive().optional(),
    details: z.string().optional(),
  })),
  environment: z.object({
    tempMin: z.number().default(-20),
    tempMax: z.number().default(70),
    indoor: z.boolean().default(true),
    certifications: z.array(z.string()).optional(),
  }).optional(),
  manufacturingClass: z.number().min(1).max(3).optional(),
});

// KiCad validation schemas
export const KiCadPinTypeSchema = z.enum([
  'input',
  'output',
  'bidirectional',
  'power_in',
  'power_out',
  'passive',
  'unspecified',
  'open_collector',
  'open_emitter',
  'no_connect',
]);

export const KiCadPadTypeSchema = z.enum([
  'thru_hole',
  'smd',
  'connect',
  'np_thru_hole',
]);

export const KiCadPadShapeSchema = z.enum([
  'circle',
  'rect',
  'oval',
  'trapezoid',
  'roundrect',
  'custom',
]);

// Validation helper functions
export function validateLCSCPartNumber(partNumber: string): boolean {
  return LCSCPartNumberSchema.safeParse(partNumber).success;
}

export function isLcscId(id: string): boolean {
  return LCSCPartNumberSchema.safeParse(id).success;
}

export function isEasyEDAUuid(id: string): boolean {
  return EasyEDAUuidSchema.safeParse(id).success;
}

export function validateComponent(component: unknown): boolean {
  return ComponentSchema.safeParse(component).success;
}

export function validateDesignConstraints(constraints: unknown): boolean {
  return DesignConstraintsSchema.safeParse(constraints).success;
}

export type ValidatedComponent = z.infer<typeof ComponentSchema>;
export type ValidatedDesignConstraints = z.infer<typeof DesignConstraintsSchema>;
