# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Monorepo commands (from root)
bun install          # Install all dependencies
bun run build        # Build all packages
bun run test         # Run tests across all packages
bun run typecheck    # Type check all packages

# Package-specific development
cd packages/core
bun run dev          # Watch mode
bun run build        # Build to ./dist
bun run test         # Run tests

cd packages/cli
bun run dev          # Watch mode with Ink
bun run build        # Build CLI

cd packages/mcp
bun run dev          # Watch mode
bun run build        # Build MCP server
```

## MCP Server Testing

Test MCP tools by sending JSON-RPC over stdin:

```bash
# List available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp/dist/index.js

# Call a tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"component_search","arguments":{"query":"STM32F103","limit":2}}}' | node packages/mcp/dist/index.js

# Fetch a component
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"library_fetch","arguments":{"lcsc_id":"C5446"}}}' | node packages/mcp/dist/index.js
```

## Architecture

### Package Structure

- **core**: Core library with reusable logic for JLC/EasyEDA component sourcing and KiCad conversion
- **cli**: Interactive terminal UI (React/Ink) for component search, install, and library management
- **mcp**: MCP server exposing JLC tools for Claude Desktop/Code integration

### Dependency Graph

```
core (foundation)
    ↑
    ├── cli (depends on core)
    └── mcp (depends on core)
```

### Data Flow

```
LCSC ID (e.g., C2040)
    → core/api/easyeda.ts (fetch from EasyEDA API)
    → core/converter/symbol.ts (convert to KiCad S-expression)
    → core/converter/category-router.ts (route to JLC-Resistors.kicad_sym, JLC-ICs.kicad_sym, etc.)
    → core/converter/footprint-mapper.ts (map to KiCad built-in or generate custom footprint)
    → core/converter/global-lib-table.ts (register in KiCad's sym-lib-table/fp-lib-table)
```

### Key Directories

- `packages/core/src/api/` - EasyEDA/LCSC API clients
- `packages/core/src/converter/` - EasyEDA to KiCad conversion logic
- `packages/core/src/services/` - High-level service layer (componentService, libraryService)
- `packages/core/src/types/` - Shared TypeScript types
- `packages/cli/src/app/` - React/Ink UI components and screens
- `packages/cli/src/commands/` - CLI command handlers
- `packages/mcp/src/tools/` - MCP tool definitions and handlers

### Library Organization

Components are routed to category-specific symbol libraries:
- `JLC-Resistors.kicad_sym`, `JLC-Capacitors.kicad_sym`, `JLC-ICs.kicad_sym`, etc.
- Footprints use KiCad built-ins when possible (0603, SOIC-8, etc.), custom packages go to `JLC.pretty/`
- Libraries are auto-registered in KiCad's global tables on server startup

### Tool Handler Pattern

MCP tools follow a consistent pattern in `packages/mcp/src/tools/`:

```typescript
// Tool definition (exported for registration)
export const myTool: Tool = {
  name: 'my_tool',
  description: '...',
  inputSchema: { ... }
};

// Handler function
export async function handleMyTool(args: unknown) {
  const parsed = MyToolSchema.parse(args);
  // ... implementation
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
```

## Validation Data

`library_fetch` returns `validation_data` with structural checks:
- `pin_pad_count_match`: Symbol pins vs footprint pads
- `has_power_pins`: Component has power_in/power_out pins
- `has_ground_pins`: Component has GND/VSS pins

Use `library_fix` to correct pin issues (swap, rename, add, remove pins).
