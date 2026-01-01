# @jlcpcb/cli

> **Unofficial package** - This is a community-maintained tool and is not affiliated with, endorsed by, or officially connected to JLCPCB, LCSC, or EasyEDA.

<video src="https://github.com/user-attachments/assets/7be693d3-0d82-473d-9fec-0d65fd994ca6" controls></video>

Interactive terminal UI for JLCPCB component search and KiCad library management. Built with React and Ink for a rich terminal experience.

## Installation

```bash
# Install globally
npm install -g @jlcpcb/cli

# Or run directly with npx
npx @jlcpcb/cli search "STM32F103"
```

## Commands

### `jlc search <query>`

Search for components from LCSC or EasyEDA community library.

```bash
# Basic search
jlc search "STM32F103"
jlc search "100nF 0402"

# Filter options
jlc search "STM32" --limit 50
jlc search "capacitor" --in-stock --basic-only
jlc search "XIAO RP2040" --community
```

**Options:**

| Option | Description |
|--------|-------------|
| `-l, --limit <n>` | Maximum results (default: 20) |
| `--in-stock` | Only show in-stock components |
| `--basic-only` | Only JLCPCB basic parts (no extended fee) |
| `--community` | Search EasyEDA community library |

**Interactive Mode:**

- Use `↑` `↓` to navigate results
- Press `Enter` to view component details
- Press `Tab` to toggle between basic/all parts
- Press `Esc` to exit

### `jlc info <id>`

Display detailed component information.

```bash
# By LCSC part number
jlc info C8734

# JSON output (for scripting)
jlc info C8734 --json
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON (non-interactive) |

**Interactive Actions:**

| Key | Action |
|-----|--------|
| `Enter` | Install component |
| `S` | Open symbol file |
| `F` | Open footprint file |
| `M` | Open 3D model |
| `D` | Open datasheet URL |
| `R` | Regenerate symbol/footprint |
| `Esc` | Go back |

### `jlc install [id]`

Install a component to KiCad libraries.

```bash
# Interactive mode (search, select, install)
jlc install

# Install specific component
jlc install C8734

# Install with options
jlc install C8734 --with-3d
jlc install C8734 --project ./my-kicad-project
jlc install C8734 --force  # Regenerate if exists
```

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --project <path>` | Install to project-local library |
| `--with-3d` | Include 3D model (STEP) |
| `-f, --force` | Force reinstall/regenerate |

**Installation Result:**

After installation, you'll see:
- **Symbol reference**: e.g., `JLC-MCP-ICs:STM32F103C8T6`
- **Footprint reference**: e.g., `Package_QFP:LQFP-48_7x7mm_P0.5mm`
- Validation info (pin/pad counts, power pins detected)

### `jlc library`

View and manage installed components.

```bash
# Interactive library browser
jlc library

# JSON output
jlc library --json
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output library status as JSON |

**Library View:**

Shows all installed components with:
- Name and category
- Description
- Symbol status (Y/N)
- Footprint type (Standard/Custom)
- 3D model status (Y/N)

Navigate with `↑` `↓` and press `Enter` to view component details.

## Keyboard Navigation

Global keyboard shortcuts across all screens:

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate list |
| `Enter` | Select / Confirm |
| `Backspace` | Go back |
| `Esc` | Exit / Cancel |
| `Tab` | Switch focus / Toggle filter |

## Workflows

### 1. Interactive Search and Install

```bash
jlc search "STM32F103"
```

1. Results appear in a table with MFR Part, Description, Package, Stock, Price
2. Navigate with arrow keys, press `Enter` to select
3. View component details (datasheet, attributes, pins)
4. Press `Enter` again to install
5. Component is added to your KiCad library

### 2. Direct Install from LCSC ID

If you know the LCSC part number:

```bash
jlc install C8734 --force
```

Directly installs without interactive UI.

### 3. Browse Installed Library

```bash
jlc library
```

1. See library status (installed, linked to KiCad)
2. Browse all installed components
3. Select any component to view details
4. Regenerate or update as needed

### 4. Scripting / Automation

Use `--json` flag for machine-readable output:

```bash
# Get component data
jlc info C8734 --json > component.json

# Get library status
jlc library --json > status.json

# Parse with jq
jlc info C8734 --json | jq '.symbol.pins | length'
```

## Library Structure

Components are organized by category:

```
~/Documents/KiCad/9.0/3rdparty/jlc_mcp/
├── symbols/
│   ├── JLC-MCP-Resistors.kicad_sym
│   ├── JLC-MCP-Capacitors.kicad_sym
│   ├── JLC-MCP-ICs.kicad_sym
│   └── ...
├── footprints/
│   └── JLC-MCP.pretty/
└── 3dmodels/
    └── JLC-MCP.3dshapes/
```

Libraries are automatically registered in KiCad's global `sym-lib-table` and `fp-lib-table`.

## Why LCSC/JLCPCB?

- **LCSC is JLCPCB's parts supplier** - Components are guaranteed available for PCB assembly
- **Basic Parts** have no extended part fee ($3 savings per unique component)
- **Direct integration** - Fetched components work seamlessly with JLCPCB assembly

## Development

```bash
# Install dependencies
bun install

# Development with watch mode
bun run dev

# Build
bun run build

# Type check
bun run typecheck
```

## Related Packages

- [`@jlcpcb/core`](../core) - Core library with API clients and converters
- [`@jlcpcb/mcp`](../mcp) - MCP server for Claude Desktop/Code integration

## License

MIT
