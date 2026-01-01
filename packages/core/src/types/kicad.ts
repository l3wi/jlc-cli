/**
 * KiCad-specific types for schematic and PCB manipulation
 */

export interface PinDefinition {
  number: string;
  name: string;
  electricalType: 'input' | 'output' | 'bidirectional' | 'power_in' | 'power_out' | 'passive' | 'unspecified' | 'open_collector' | 'open_emitter' | 'no_connect';
  x: number;
  y: number;
  rotation: number;
  length: number;
}

export interface PadDefinition {
  number: string;
  type: 'thru_hole' | 'smd' | 'connect' | 'np_thru_hole';
  shape: 'circle' | 'rect' | 'oval' | 'trapezoid' | 'roundrect' | 'custom';
  x: number;
  y: number;
  width: number;
  height: number;
  drill?: number;
  layers: string[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KiCadSymbol {
  name: string;
  library: string;
  pins: PinDefinition[];
  properties: Record<string, string>;
}

export interface KiCadFootprint {
  name: string;
  library: string;
  pads: PadDefinition[];
  layers: string[];
  courtyard: BoundingBox;
  properties: Record<string, string>;
}

export interface SchematicComponent {
  reference: string;
  value: string;
  symbol: string;
  footprint: string;
  position: { x: number; y: number };
  rotation: number;
  properties: Record<string, string>;
}

export interface Wire {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface NetLabel {
  name: string;
  x: number;
  y: number;
  rotation: number;
}

export interface SchematicSheet {
  name: string;
  filename: string;
  position: { x: number; y: number };
}

export interface KiCadSchematic {
  version: string;
  components: SchematicComponent[];
  wires: Wire[];
  labels: NetLabel[];
  sheets: SchematicSheet[];
}

export interface KiCadPCB {
  version: string;
  layers: PCBLayer[];
  components: PCBComponent[];
  traces: Trace[];
  vias: Via[];
  zones: Zone[];
  boardOutline: BoardOutline;
}

export interface PCBLayer {
  number: number;
  name: string;
  type: 'signal' | 'power' | 'mixed' | 'user';
}

export interface PCBComponent {
  reference: string;
  footprint: string;
  position: { x: number; y: number };
  rotation: number;
  layer: 'F.Cu' | 'B.Cu';
}

export interface Trace {
  net: string;
  width: number;
  layer: string;
  points: { x: number; y: number }[];
}

export interface Via {
  net: string;
  position: { x: number; y: number };
  size: number;
  drill: number;
  layers: [string, string];
}

export interface Zone {
  net: string;
  layer: string;
  priority: number;
  outline: { x: number; y: number }[];
}

export interface BoardOutline {
  points: { x: number; y: number }[];
}
