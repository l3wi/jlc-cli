# @jlcpcb/core

> **Unofficial package** - This is a community-maintained tool and is not affiliated with, endorsed by, or officially connected to JLCPCB, LCSC, or EasyEDA.

Core library for JLC/EasyEDA component sourcing and KiCad conversion. Provides API clients, symbol/footprint converters, and library management services.

## Installation

```bash
npm install @jlcpcb/core
# or
bun add @jlcpcb/core
```

## Quick Start

```typescript
import {
  createComponentService,
  createLibraryService
} from '@jlcpcb/core';

// Search for components
const componentService = createComponentService();
const results = await componentService.search('STM32F103', {
  limit: 10,
  inStock: true,
  basicOnly: true,
});

// Install to KiCad library
const libraryService = createLibraryService();
const result = await libraryService.install('C8734', {
  include3d: true,
});

console.log(result.symbolRef);    // "JLC-MCP-ICs:STM32F103C8T6"
console.log(result.footprintRef); // "Package_QFP:LQFP-48_7x7mm_P0.5mm"
```

## API Reference

### Services

High-level APIs for common operations.

#### ComponentService

Search and fetch component data from LCSC/EasyEDA.

```typescript
import { createComponentService } from '@jlcpcb/core';

const service = createComponentService();

// Search LCSC catalog
const results = await service.search('100nF 0402', {
  limit: 20,
  inStock: true,
  basicOnly: true,           // Only JLCPCB basic parts
  source: 'lcsc',            // 'lcsc' | 'easyeda-community' | 'all'
});

// Fetch full component data
const component = await service.fetch('C2040');

// Get component details with pin/pad counts
const details = await service.getDetails('C2040');

// Fetch from EasyEDA community library
const communityComponent = await service.fetchCommunity('uuid-here');
```

**SearchOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `20` | Maximum results |
| `inStock` | `boolean` | `false` | Only in-stock parts |
| `basicOnly` | `boolean` | `false` | Only JLCPCB basic parts |
| `source` | `string` | `'lcsc'` | Search source |

#### LibraryService

Install components to KiCad libraries.

```typescript
import { createLibraryService } from '@jlcpcb/core';

const lib = createLibraryService();

// Install component to global library
const result = await lib.install('C2040', {
  include3d: true,
});

// Install to project-local library
const result = await lib.install('C2040', {
  projectPath: '/path/to/kicad/project',
  include3d: true,
});

// List installed components
const installed = await lib.listInstalled();

// Check library status
const status = await lib.getStatus();
// { installed: true, linked: true, kicadVersion: '9.0', path: '...' }

// Initialize/register global library tables
await lib.ensureGlobalTables();
```

**InstallOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectPath` | `string` | - | Project path for local install |
| `include3d` | `boolean` | `false` | Download 3D model |
| `force` | `boolean` | `false` | Regenerate if exists |

**InstallResult:**

```typescript
interface InstallResult {
  symbolRef: string;           // "JLC-MCP-ICs:STM32F103C8T6"
  footprintRef: string;        // "Package_QFP:LQFP-48..."
  symbolPath: string;          // Absolute path to .kicad_sym
  footprintPath?: string;      // Path to .kicad_mod (if custom)
  modelPath?: string;          // Path to .step (if included)
  symbolAction: 'created' | 'appended' | 'exists' | 'replaced';
  footprintType: 'builtin' | 'custom';
  validationData: {
    pinCount: number;
    padCount: number;
    pinPadCountMatch: boolean;
    hasPowerPins: boolean;
    hasGroundPins: boolean;
  };
}
```

### API Clients

Low-level clients for direct API access.

#### JLCClient

Search JLCPCB/LCSC catalog.

```typescript
import { jlcClient } from '@jlcpcb/core';

// Search components
const results = await jlcClient.search('STM32F103', {
  limit: 10,
  page: 1,
  inStock: true,
  basicOnly: true,
});

// Get current stock and pricing
const stock = await jlcClient.getStock('C2040');
// { stock: 50000, priceTiers: [{ qty: 1, price: 0.15 }, ...] }

// Get detailed component info with attributes
const details = await jlcClient.getComponentDetails('C2040');
```

#### EasyEDAClient

Fetch symbol/footprint data from EasyEDA.

```typescript
import { easyedaClient } from '@jlcpcb/core';

// Get complete component data
const data = await easyedaClient.getComponentData('C2040');
// Returns: { info, symbol, footprint, model3d }

// Download 3D model
const modelBuffer = await easyedaClient.get3DModel('uuid', 'step');
// Returns: Buffer containing STEP file
```

**EasyEDAComponentData:**

```typescript
interface EasyEDAComponentData {
  info: {
    lcsc: string;
    manufacturer: string;
    mfrPart: string;
    package: string;
    datasheet: string;
    description: string;
    category: string;
  };
  symbol: {
    pins: EasyEDAPin[];
    rectangles: EasyEDASymbolRect[];
    circles: EasyEDASymbolCircle[];
    arcs: EasyEDASymbolArc[];
    polylines: EasyEDASymbolPolyline[];
    paths: EasyEDASymbolPath[];
  };
  footprint: {
    pads: EasyEDAPad[];
    tracks: EasyEDATrack[];
    holes: EasyEDAHole[];
    circles: EasyEDACircle[];
    vias: EasyEDAVia[];
    solidRegions: EasyEDASolidRegion[];
  };
  model3d?: EasyEDA3DModel;
}
```

#### EasyEDACommunityClient

Search user-contributed components.

```typescript
import { easyedaCommunityClient } from '@jlcpcb/core';

// Search community library
const results = await easyedaCommunityClient.search({
  query: 'XIAO RP2040',
  limit: 10,
});

// Get full component by UUID
const component = await easyedaCommunityClient.getComponent('uuid');

// Download 3D model
const model = await easyedaCommunityClient.get3DModel('uuid', 'step');
```

### Converters

Convert EasyEDA format to KiCad S-expression format.

#### SymbolConverter

```typescript
import { symbolConverter } from '@jlcpcb/core';

// Generate complete KiCad symbol library
const kicadSym = symbolConverter.convert(componentData, {
  libraryName: 'MyLibrary',
  includeDatasheet: true,
});

// Generate symbol entry only (for appending)
const entry = symbolConverter.convertToSymbolEntry(componentData);

// Append to existing library
const updated = symbolConverter.appendToLibrary(existingContent, componentData);

// Replace symbol in library
const replaced = symbolConverter.replaceInLibrary(existingContent, componentData);

// Check if symbol exists
const exists = symbolConverter.symbolExistsInLibrary(content, 'STM32F103C8T6');

// Get symbol name from component
const name = symbolConverter.getSymbolName(componentData);
```

#### FootprintConverter

```typescript
import { footprintConverter } from '@jlcpcb/core';

// Generate KiCad footprint file
const kicadMod = footprintConverter.convert(componentData, {
  footprintName: 'LQFP-48_Custom',
  include3dModel: true,
  modelPath: '${KICAD9_3RD_PARTY}/jlc_mcp/3dmodels/...',
});

// Get footprint (returns reference for built-in or generates custom)
const result = footprintConverter.getFootprint(componentData);
// { type: 'builtin', ref: 'Package_QFP:LQFP-48_7x7mm_P0.5mm' }
// or
// { type: 'custom', content: '(footprint ...)' }
```

### Utilities

#### CategoryRouter

Route components to category-based libraries.

```typescript
import { categoryRouter } from '@jlcpcb/core';

// Determine library category from component
const category = categoryRouter.getLibraryCategory('R', 'Resistors', '100k 0603');
// 'Resistors'

// Get library filename
const filename = categoryRouter.getLibraryFilename('Resistors');
// 'JLC-MCP-Resistors.kicad_sym'

// Get full symbol reference
const ref = categoryRouter.getSymbolReference('ICs', 'STM32F103C8T6');
// 'JLC-MCP-ICs:STM32F103C8T6'

// Get footprint reference
const fpRef = categoryRouter.getFootprintReference('LQFP-48_Custom');
// 'JLC-MCP:LQFP-48_Custom'

// List all categories
const categories = categoryRouter.getAllCategories();
// ['Resistors', 'Capacitors', 'Inductors', 'Diodes', 'Transistors', ...]
```

**Categories:** Resistors, Capacitors, Inductors, Diodes, Crystals, Transistors, MCUs, Memory, Sensors, Interface, Power, Optocouplers, Connectors, ICs, Misc

#### FootprintMapper

Map package names to KiCad built-in footprints.

```typescript
import { footprintMapper } from '@jlcpcb/core';

// Map package to KiCad footprint
const fp = footprintMapper.mapToKicadFootprint('0603');
// 'Resistor_SMD:R_0603_1608Metric'

const fp2 = footprintMapper.mapToKicadFootprint('SOIC-8');
// 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'

// Check if standard passive
const isStandard = footprintMapper.isStandardPassive('0805');
// true

// Get reference with category context
const ref = footprintMapper.getKicadFootprintRef('SOT-23', 'Transistors');
// 'Package_TO_SOT_SMD:SOT-23'
```

**Supported Packages:**
- SMD sizes: 0201, 0402, 0603, 0805, 1206, 1210, 1812, 2010, 2512
- SOIC: 8, 14, 16, 16W, 20, 24, 28-pin
- TSSOP: 8, 14, 16, 20, 24, 28-pin
- SOT: SOT-23, SOT-89, SOT-223
- SOD: SOD-123, SOD-123F
- QFP/LQFP: 32, 48, 64, 100-pin
- BGA: Various pitch/ball counts

#### ValueNormalizer

Extract and normalize component values.

```typescript
import { valueNormalizer } from '@jlcpcb/core';

// Normalize component value
const value = valueNormalizer.normalizeValue('100nF 10% 50V X7R');
// '100nF'

// Detect component type
const type = valueNormalizer.detectComponentType('10k 0603 1%');
// 'resistor'

// Extract display value
const display = valueNormalizer.extractDisplayValue('100uF 16V Electrolytic');
// '100uF 16V'
```

## Types

Key TypeScript types exported from `@jlcpcb/core/types`:

```typescript
import type {
  // Component types
  Component,
  ComponentSearchResult,
  ComponentDetails,
  PriceTier,

  // EasyEDA types
  EasyEDAComponentData,
  EasyEDAPin,
  EasyEDAPad,
  EasyEDASymbolRect,
  EasyEDASymbolCircle,
  EasyEDASymbolArc,

  // Installation types
  InstallResult,
  InstallOptions,
  LibraryStatus,

  // Search types
  SearchOptions,
  SearchResult,
} from '@jlcpcb/core/types';
```

## Architecture

### Data Flow

```
LCSC Part Number (e.g., C2040)
        │
        ▼
┌───────────────────────────────────┐
│  JLCClient / EasyEDAClient        │  Fetch component data
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│  SymbolConverter                  │  Convert to KiCad S-expression
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│  FootprintMapper / Converter      │  Map to built-in or generate
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│  CategoryRouter                   │  Route to category library
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│  LibraryService                   │  Write files, update tables
└───────────────────────────────────┘
```

### Library Organization

Components are organized into category-based symbol libraries:

```
~/Documents/KiCad/9.0/3rdparty/jlc_mcp/
├── symbols/
│   ├── JLC-MCP-Resistors.kicad_sym
│   ├── JLC-MCP-Capacitors.kicad_sym
│   ├── JLC-MCP-ICs.kicad_sym
│   └── ...
├── footprints/
│   └── JLC-MCP.pretty/
│       └── [custom footprints]
└── 3dmodels/
    └── JLC-MCP.3dshapes/
        └── [STEP files]
```

### Hybrid Footprint Strategy

- **Standard packages** (0603, SOIC-8, etc.) use KiCad's built-in footprint library
- **Non-standard packages** get custom footprints generated in `JLC-MCP.pretty/`

This keeps library size small while ensuring full compatibility.

## Development

```bash
bun run dev        # Watch mode
bun run build      # Build to ./dist
bun run test       # Run tests
bun run typecheck  # Type checking
```

## License

MIT
