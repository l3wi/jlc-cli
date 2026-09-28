# @jlcpcb/cli

> **Unofficial package** - This is a community-maintained tool and is not affiliated with, endorsed by, or officially connected to JLCPCB, LCSC, or EasyEDA.

Interactive terminal UI for JLCPCB component search and KiCad library management. Built with React and Ink for a rich terminal experience.

<video src="https://github.com/user-attachments/assets/7be693d3-0d82-473d-9fec-0d65fd994ca6" controls></video>

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
jlc search "0201 resistor" --economic-only
jlc search "XIAO RP2040" --community
```

**Options:**

| Option | Description |
|--------|-------------|
| `-l, --limit <n>` | Maximum results (default: 20) |
| `--in-stock` | Only show in-stock components |
| `--basic-only` | Only JLCPCB basic parts (no extended fee) |
| `--economic-only` | Only parts usable with Economic PCBA (Standard Only parts require the pricier Standard PCBA service) |
| `--community` | Search EasyEDA community library |

**PCBA type:** JLC marks some parts "Standard Only" — they cannot be assembled with the cheaper Economic PCBA
service. Every result carries `pcba_type` (`economic-and-standard` or `standard-only`) and the list/JSON output
shows a `PCBA` column (`Econ+Std` / `Std Only`). JLCPCB ignores a server-side filter for this, so
`--economic-only` over-fetches one page (50 rows) and filters locally, which can yield fewer than `--limit` rows.

**Interactive Mode:**

- Use `↑` `↓` to navigate results
- Press `Enter` to view component details
- Press `Tab` to toggle between basic/all parts
- Press `e` to toggle the Economic-PCBA-only filter
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
| `D` | Delete installed component |
| `O` | Open datasheet URL |
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
| `-y, --yes` | Install directly without the TUI |
| `--json` | Install directly and emit JSON |

Destination, force, and 3D options apply throughout interactive selection and confirmation as well as direct installation. A project-local install checks and updates that project's library rather than a global copy.

**Installation Result:**

After installation, you'll see:
- **Symbol reference**: e.g., `JLC-MCP-ICs:STM32F103C8T6`
- **Footprint reference**: a KiCad standard passive reference or a generated `JLC-MCP:...` reference
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

### Regeneration and validation exit status

`jlc library regenerate --project ./my-kicad-project` reports each component failure and exits nonzero if any regeneration fails.

`jlc validate C8734 --json` also exits nonzero when a requested symbol or footprint reference is unavailable. `--symbol-only` and `--footprint-only` disable the other comparison; a missing requested reference is never treated as a successful comparison.

Footprint validation checks copper boundaries, layers, plating, slot dimensions/orientation/offset, mechanical holes, and vias. Unknown manufacturing metadata fails as unverified rather than passing on pad count alone. Batch fixtures also verify the live manufacturer part number and package identity. The footprint limits are 0.05 mm for position and 0.02 mm for full dimensions.

Symbol validation checks pin identity, names, relative connection layout, direction, and declared electrical type. It ignores only global translation, with a maximum 0.05 mm position tolerance and 1° direction tolerance. Missing/duplicate identities, unsupported metadata, and meaningful differences are blocking errors—not warning-only passes.

JSON and HTML reports explicitly identify this as **pin validation**: body graphics, text, pin lengths, and pin styles are not compared. Standardized passive symbols can intentionally differ from their source and still fail this comparison. The live fixture catalog also retains failures for empty RP2040 pin electrical metadata and duplicate Mini-USB pin identities; fixture expectations never bypass CLI failures.

Generate a side-by-side report with `jlc validate C42417612 --symbol-only --html validation.html`. Browser previews preserve capsules, custom copper, offsets, arcs, fills, and visible labels, but use browser fonts rather than KiCad's stroke fonts.

Generation preserves source geometry or returns an error for ambiguous drills and unsupported cutout semantics. Standard substitution is limited to compatible unpolarized two-terminal R/C/L packages; it intentionally uses KiCad's nominal land pattern. Existing installations need explicit regeneration, for example `jlc install C8734 --force`, to receive these corrections.

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
