# @jlcpcb

> **Unofficial packages** - These are community-maintained tools and are not affiliated with, endorsed by, or officially connected to JLCPCB or EasyEDA.

A toolkit for sourcing electronic components from JLCPCB/LCSC and converting them to KiCad format. Includes a CLI, core library, and MCP server for AI-assisted electronics design.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@jlcpcb/cli`](./packages/jlc-cli) | Interactive terminal UI for component search & library management | [![npm](https://img.shields.io/npm/v/@jlcpcb/cli)](https://www.npmjs.com/package/@jlcpcb/cli) |
| [`@jlcpcb/core`](./packages/jlc-core) | Core library with API clients, converters, and services | [![npm](https://img.shields.io/npm/v/@jlcpcb/core)](https://www.npmjs.com/package/@jlcpcb/core) |
| [`@jlcpcb/mcp`](./packages/jlc-mcp) | MCP server for Claude Desktop/Code integration | [![npm](https://img.shields.io/npm/v/@jlcpcb/mcp)](https://www.npmjs.com/package/@jlcpcb/mcp) |

## Features

- **Component Search**: Search JLCPCB/LCSC's catalog of millions of components
- **KiCad Conversion**: Automatic conversion of EasyEDA symbols and footprints to KiCad format
- **Library Management**: Organize components into category-based KiCad libraries
- **AI Integration**: MCP server enables Claude to help with component selection and schematic design
- **Interactive UI**: Terminal-based interface with keyboard navigation

## Installation

### CLI (Recommended for most users)

```bash
# Install globally
npm install -g @jlcpcb/cli

# Or run directly with npx
npx @jlcpcb/cli search "STM32F103"
```

### MCP Server (For Claude Desktop/Code)

```bash
npm install -g @jlcpcb/mcp
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jlcpcb": {
      "command": "npx",
      "args": ["-y", "@jlcpcb/mcp"]
    }
  }
}
```

### Core Library (For developers)

```bash
npm install @jlcpcb/core
```

## CLI Usage

### Search for components

```bash
# Interactive search
jlc search

# Direct search
jlc search "STM32F103"
jlc search "100nF 0402"
```

### View component details

```bash
# By LCSC part number
jlc info C8734

# Interactive mode
jlc info
```

### Install components to KiCad library

```bash
# Install specific component
jlc install C8734

# Interactive install with search
jlc install
```

### Manage your library

```bash
# View installed components
jlc library

# Initialize library structure
jlc library --init
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate list |
| `Enter` | Select / Confirm |
| `Backspace` | Go back |
| `Esc` | Exit |
| `Tab` | Switch focus |

## MCP Server Tools

When using Claude Desktop or Claude Code with the MCP server, the following tools are available:

| Tool | Description |
|------|-------------|
| `component_search` | Search JLCPCB/LCSC catalog |
| `component_get` | Get detailed component information |
| `library_fetch` | Fetch and convert component to KiCad format |
| `library_update` | Update existing library component |
| `library_fix` | Fix pin mappings or symbol issues |
| `easyeda_search` | Search EasyEDA community library |
| `easyeda_fetch` | Fetch from EasyEDA community library |

### Example Claude Interaction

> "Find me a USB-C connector with JLCPCB basic parts availability and add it to my KiCad library"

Claude will use the MCP tools to search, evaluate options, and install the component.

## Core Library Usage

```typescript
import {
  createComponentService,
  createLibraryService
} from '@jlcpcb/core';

// Search for components
const componentService = createComponentService();
const results = await componentService.search({
  query: 'STM32F103C8T6',
  limit: 10
});

// Install to KiCad library
const libraryService = createLibraryService('/path/to/project');
await libraryService.install('C8734');
```

## Library Organization

Components are automatically organized into category-based symbol libraries:

```
~/.jlc/                          # Global library location
├── JLC-Capacitors.kicad_sym
├── JLC-Resistors.kicad_sym
├── JLC-ICs.kicad_sym
├── JLC-Connectors.kicad_sym
├── JLC-Discretes.kicad_sym
└── JLC.pretty/                  # Custom footprints
    ├── LQFP-48_7x7mm_P0.5mm.kicad_mod
    └── ...
```

Libraries are automatically registered in KiCad's global symbol and footprint tables.

## Data Flow

```
LCSC Part Number (e.g., C8734)
    │
    ▼
┌─────────────────────────────────┐
│  EasyEDA API                    │  Fetch component data
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Symbol Converter               │  Convert to KiCad S-expression
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Footprint Mapper               │  Map to KiCad built-in or generate
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Category Router                │  Route to appropriate .kicad_sym
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Library Tables                 │  Register in KiCad config
└─────────────────────────────────┘
```

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Node.js 18+

### Setup

```bash
# Clone the repository
git clone https://github.com/l3wi/jlc-cli.git
cd jlc-cli

# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test
```

### Package Development

```bash
# Work on CLI
cd packages/jlc-cli
bun run dev

# Work on MCP server
cd packages/jlc-mcp
bun run dev

# Work on core library
cd packages/jlc-core
bun run dev
```

### Testing MCP Server

```bash
# List available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx @jlcpcb/mcp

# Search for components
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"component_search","arguments":{"query":"STM32F103","limit":5}}}' | npx @jlcpcb/mcp
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Disclaimer

This project is not affiliated with, endorsed by, or officially connected to:
- **JLCPCB** (Shenzhen JLC Technology Group Co., Ltd.)
- **LCSC Electronics** (Shenzhen LCSC Electronics Co., Ltd.)
- **EasyEDA** (Shenzhen Lichuang E-COMMERCE Co., Ltd.)

All product names, logos, and brands are property of their respective owners. Use of these names, logos, and brands does not imply endorsement.

Component data is fetched from publicly available APIs. Please respect the terms of service of these platforms.
