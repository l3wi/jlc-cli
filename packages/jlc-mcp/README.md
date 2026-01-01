# jlc-mcp

MCP server for JLC/LCSC component sourcing and KiCad library conversion.

Search JLCPCB's parts database, fetch components as KiCad-compatible symbols and footprints, and manage organized component libraries - all through the Model Context Protocol.

## Why LCSC?

**LCSC is JLC PCB's preferred supplier for assembly (PCBA).** Components with LCSC part numbers (e.g., C2040) are guaranteed to be available when ordering PCB assembly from JLCPCB.

- **Basic Parts Library**: Components marked as "Basic" have no extended part fee ($3 savings per unique part)
- **In-Stock Filtering**: Search only parts currently available for immediate assembly
- **Direct Integration**: Fetched components are ready for JLC assembly without manual library work

## Features

- Search JLCPCB parts database with stock levels and pricing
- Fetch components directly to KiCad-compatible symbol/footprint format
- Category-based library organization (Resistors, Capacitors, ICs, etc.)
- Hybrid footprint strategy: standard packages use KiCad built-ins, custom packages are generated
- EasyEDA community library support for modules and breakouts
- 3D model downloads (STEP/OBJ formats)

## Usage

### Option 1: Quick Start (npx)

No installation required - run directly:

```bash
npx -y jlc-mcp@latest
```

**Claude Desktop configuration** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jlc": {
      "command": "npx",
      "args": ["-y", "jlc-mcp@latest"]
    }
  }
}
```

### Option 2: Local Development

Clone and build:

```bash
git clone https://github.com/anthropics/ai-eda.git
cd ai-eda/packages/jlc-mcp
bun install
bun run build
```

**Claude Desktop configuration:**

```json
{
  "mcpServers": {
    "jlc": {
      "command": "node",
      "args": ["/absolute/path/to/jlc-mcp/dist/index.js"]
    }
  }
}
```

> **Note:** Restart Claude Desktop after modifying the configuration.

## Tools Reference

### Search & Discovery

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `component_search` | Search JLCPCB parts database | `query`, `in_stock`, `basic_only`, `limit` |
| `component_get` | Get detailed component info by LCSC ID | `lcsc_id` (e.g., "C2040") |

### Library Management

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `library_fetch` | Fetch component and add to KiCad library | `lcsc_id`, `project_path`?, `include_3d`? |
| `library_get_symbol` | Get raw KiCad symbol data | `lcsc_id` |
| `library_get_footprint` | Get raw KiCad footprint data | `lcsc_id` |
| `library_get_3d_model` | Download 3D model | `uuid`, `format` |
| `library_update` | Initialize or regenerate all components | `project_path`?, `dry_run`? |

### EasyEDA Community Library

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `easyeda_search` | Search community-contributed components | `query`, `source`, `open_preview` |
| `easyeda_get` | Get community component details | `uuid` |
| `easyeda_fetch` | Fetch community component to project | `uuid`, `project_path`, `include_3d` |
| `easyeda_get_3d_model` | Download community 3D model | `uuid`, `format` |

## Usage Examples

### Search for components

```
component_search(query="STM32F103", in_stock=true, basic_only=true)
```

Returns matching components with LCSC IDs, stock levels, and pricing.

### Fetch to global library

```
library_fetch(lcsc_id="C8734")
```

Downloads the component and returns:
- `symbol_ref`: Reference for schematic (e.g., `JLC-MCP-ICs:STM32F103C8T6`)
- `footprint_ref`: Reference for PCB (e.g., `Package_QFP:LQFP-48_7x7mm_P0.5mm`)

### Fetch to project-local library

```
library_fetch(lcsc_id="C8734", project_path="/path/to/kicad/project", include_3d=true)
```

### Initialize libraries

```
library_update()
```

Creates the category-based library structure if it doesn't exist:
- Creates `JLC-MCP-Resistors.kicad_sym`, `JLC-MCP-Capacitors.kicad_sym`, etc.
- Creates `JLC-MCP.pretty/` footprint directory
- Creates `JLC-MCP.3dshapes/` 3D model directory

### Search EasyEDA community

```
easyeda_search(query="XIAO RP2040", open_preview=true)
```

Opens an HTML preview in your browser with symbol/footprint thumbnails.

## Library Organization

### Category-Based Routing

Components are automatically sorted into category-specific libraries:

| Library | Components |
|---------|------------|
| `JLC-MCP-Resistors.kicad_sym` | Resistors, potentiometers |
| `JLC-MCP-Capacitors.kicad_sym` | Capacitors (ceramic, electrolytic, etc.) |
| `JLC-MCP-Inductors.kicad_sym` | Inductors, ferrite beads |
| `JLC-MCP-Diodes.kicad_sym` | Diodes, LEDs, Zeners |
| `JLC-MCP-Transistors.kicad_sym` | MOSFETs, BJTs |
| `JLC-MCP-ICs.kicad_sym` | Integrated circuits, MCUs |
| `JLC-MCP-Connectors.kicad_sym` | Connectors, headers |
| `JLC-MCP-Misc.kicad_sym` | Everything else |

### Storage Paths

**Global (default):**

Libraries are stored in the KiCad 3rdparty folder for cross-platform portability:
- macOS/Windows: `~/Documents/KiCad/9.0/3rdparty/jlc_mcp/`
- Linux: `~/.local/share/kicad/9.0/3rdparty/jlc_mcp/`

Table entries use `${KICAD9_3RD_PARTY}` for portable paths.

```
~/Documents/KiCad/9.0/3rdparty/jlc_mcp/
├── symbols/
│   ├── JLC-MCP-Resistors.kicad_sym
│   ├── JLC-MCP-Capacitors.kicad_sym
│   └── ...
├── footprints/
│   └── JLC-MCP.pretty/
└── 3dmodels/
    └── JLC-MCP.3dshapes/
```

**Project-local (when `project_path` specified):**
```
<project>/libraries/
├── symbols/
│   └── JLC-MCP-*.kicad_sym
├── footprints/
│   └── JLC-MCP.pretty/
└── 3dmodels/
    └── JLC-MCP.3dshapes/
```

### Hybrid Footprint Strategy

- **Standard packages** (0603, 0805, SOIC-8, SOT-23, etc.) use KiCad's built-in footprints
- **Non-standard packages** get custom footprints generated in `JLC-MCP.pretty/`

This keeps libraries small while ensuring compatibility.

## Integration with ai-eda

When used with the [ai-eda](https://github.com/anthropics/ai-eda) toolkit, the `/eda-source` command provides an interactive component sourcing workflow:

1. Reads project constraints from `design-constraints.json`
2. Searches local KiCad libraries first, then LCSC online
3. Downloads and analyzes component datasheets
4. Presents options with thermal and assembly validation
5. Fetches selected components with proper references

Example:
```
/eda-source main-mcu
```

The command guides you through selecting an MCU that fits your project's requirements, validates it against design constraints, and adds it to your libraries.

## Development

```bash
bun run dev        # Development with watch mode
bun run build      # Build to ./dist
bun run start      # Run the server
bun run typecheck  # Type checking
bun run test       # Run tests
bun run clean      # Remove dist/
```

## How It Works

1. **Search**: Queries JLCPCB's API for component data
2. **Fetch**: Retrieves symbol/footprint data from EasyEDA (LCSC's component library backend)
3. **Convert**: Transforms EasyEDA format to KiCad S-expression format
4. **Route**: Categorizes components and routes to appropriate library files
5. **Store**: Writes KiCad-compatible files and updates library tables

## License

MIT
