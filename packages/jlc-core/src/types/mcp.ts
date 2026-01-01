/**
 * MCP protocol types for AI-EDA tools
 */

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

export interface MCPPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: MCPPropertySchema;
  default?: unknown;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

// Tool-specific types
export interface ComponentSearchParams {
  query: string;
  category?: string;
  inStock?: boolean;
  limit?: number;
}

export interface LibraryFetchParams {
  lcscPartNumber: string;
  outputDir?: string;
  include3D?: boolean;
}

export interface DatasheetDownloadParams {
  lcscPartNumber: string;
  outputPath?: string;
}

export interface SchematicParams {
  projectPath: string;
  sheetName?: string;
}

export interface PCBParams {
  projectPath: string;
}

export interface ExportParams {
  projectPath: string;
  format: 'jlcpcb' | 'pcbway' | 'oshpark' | 'generic';
  outputDir?: string;
}
