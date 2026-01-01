# @jlcpcb

> **Unofficial packages** - These are community-maintained tools and are not affiliated with, endorsed by, or officially connected to JLCPCB, LCSC, or EasyEDA.

Toolkit for sourcing electronic components from JLCPCB/LCSC and converting them to KiCad format.

## Packages

### [@jlcpcb/cli](./packages/cli)

Interactive terminal UI for component search and KiCad library management.

- Search LCSC catalog with stock/price filters
- Install components directly to KiCad libraries
- Browse and manage installed components

[![npm](https://img.shields.io/npm/v/@jlcpcb/cli)](https://www.npmjs.com/package/@jlcpcb/cli)

### [@jlcpcb/core](./packages/core)

Core library with API clients, converters, and services.

- JLC/EasyEDA API clients for component data
- Symbol and footprint converters (EasyEDA → KiCad)
- Library management with category-based organization

[![npm](https://img.shields.io/npm/v/@jlcpcb/core)](https://www.npmjs.com/package/@jlcpcb/core)

### [@jlcpcb/mcp](./packages/mcp)

MCP server for Claude Desktop/Code integration.

- AI-assisted component selection
- Natural language component sourcing
- Automatic library management

[![npm](https://img.shields.io/npm/v/@jlcpcb/mcp)](https://www.npmjs.com/package/@jlcpcb/mcp)

## Quick Start

```bash
npx @jlcpcb/cli search "STM32F103"
```

## Development

```bash
git clone https://github.com/l3wi/jlc-cli.git
cd jlc-cli
bun install
bun run build
```

## License

MIT
