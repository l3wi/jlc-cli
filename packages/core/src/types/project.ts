/**
 * Project structure and configuration types
 */

import type { ComponentSelection } from './component.js';

export interface EDAProject {
  name: string;
  version: string;
  created: string;
  modified: string;
  constraints: DesignConstraints;
  components: ComponentSelection[];
  status: ProjectStatus;
}

export interface DesignConstraints {
  boardSize?: { width: number; height: number; unit: 'mm' | 'inch' };
  layers: number;
  powerSource: PowerSourceSpec;
  interfaces: InterfaceSpec[];
  environment?: EnvironmentSpec;
  manufacturingClass?: number;  // IPC class 1/2/3
}

export interface PowerSourceSpec {
  type: 'usb' | 'battery' | 'dc_jack' | 'poe' | 'other';
  voltage: { min: number; max: number };
  current?: number;
  details?: string;
}

export interface InterfaceSpec {
  type: 'usb' | 'uart' | 'spi' | 'i2c' | 'ethernet' | 'wifi' | 'bluetooth' | 'can' | 'rs485' | 'gpio' | 'adc' | 'dac' | 'pwm' | 'other';
  count?: number;
  details?: string;
}

export interface EnvironmentSpec {
  tempMin: number;
  tempMax: number;
  indoor: boolean;
  certifications?: string[];
}

export interface ProjectStatus {
  phase: 'specification' | 'component_selection' | 'schematic' | 'pcb_layout' | 'validation' | 'manufacturing';
  schematicComplete: boolean;
  pcbComplete: boolean;
  validated: boolean;
  exported: boolean;
}

export interface ProjectConfig {
  kicadProjectDir: string;
  librariesDir: string;
  datasheetsDir: string;
  productionDir: string;
  docsDir: string;
}
