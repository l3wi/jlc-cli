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
console.log(result.footprintRef); // Library-qualified generated footprint reference
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
| `economicOnly` | `boolean` | `false` | Only parts supported by Economic PCBA (excludes "Standard Only" parts) |
| `typeIds` | `number[]` | — | Restrict to JLCPCB component types (ids from `getComponentTypes`) |
| `attributeFilters` | `AttributeFilterGroup[]` | — | Attribute values, e.g. `[{ 'Output Current': ['1A'] }]`; values OR inside an attribute, each group ANDs |
| `brands` | `string[]` | — | Exact manufacturer names from `getFilterAttributes().brands` |
| `packages` | `string[]` | — | Exact package names from `getFilterAttributes().packages` |
| `source` | `string` | `'lcsc'` | Search source |

#### Catalogue browsing and attribute filters

JLCPCB's parts API is type-scoped: a component type has its own attribute vocabulary, and searching can be
driven by those values instead of free text. Attributes are only filterable by exact vocabulary strings —
which is what `resolveAttributeQuery` produces from a value constraint, using the API's own unit metadata.

```typescript
import { createComponentService, resolveAttributeQuery } from '@jlcpcb/core';

const service = createComponentService();

// 1. Types (two levels): grade 1 = category, grade 2 = leaf. `id` is what filters consume.
const types = await service.getComponentTypes();
const ldo = types.find(t => t.grade === 2 && t.name.includes('Low Drop Out')); // id 2956, 63730 parts

// 2. Vocabulary, counts, brands and packages for that type ([] = whole catalogue)
const facets = await service.getFilterAttributes([ldo!.id]);
const current = facets.attributes.find(a => a.name === 'Output Current')!;
// current: { kind: 'range', unit: 'A', unitConversionMap: { fA…kA }, values: [{ value: '1A', docCount: 5125, numbers: [1] }, …] }
// facets.counts: { economic: 63395, standard: 63730, … } — the difference needs the pricier Standard PCBA

// 3. Turn "can do 1A" into the exact values the API accepts (ranges, multi-values and units handled)
const amps = resolveAttributeQuery(current, { attribute: 'Output Current', min: 1, unit: 'A' });
// amps.values: 50 buckets incl. '1A', '500mA、1A', '1A、2A'; amps.predictedTotal: 10168

// 4. Filter: empty query is fine when the type and attributes scope the result set
const page = await service.searchPage('', {
  typeIds: [ldo!.id],
  attributeFilters: [{ 'Output Current': amps.values }, { 'Output Type': ['Adjustable'] }],
  limit: 20,
});
// page.total === 2007 (equals the sum of the matched facet docCounts), page.results[].attributes carry the values
```

Notes:

- `predictedTotal` from a resolution equals the `searchPage().total` the filter yields (facet buckets are
  disjoint), so a UI can preview counts before querying.
- Attribute values are case- and unit-sensitive (`1000mA` matches nothing); pass `values` for exact
  vocabulary entries or `min`/`max` to translate bounds. `min` means "the part can reach at least",
  `max` "at least as low" (use `max` for negative requirements such as "operates down to -40℃").
- `searchPage` returns `total` for pagination; `search` is the list-only convenience over it.
- Payload sizes: catalogue ~320 KB, facets multi-MB for a large type, so fetch facets per type and cache
  them (`componentCount` drifts, ids do not).
- `typeIds: []` on `getFilterAttributes` means the whole catalogue (7.2M parts, 3600+ brands).

#### LibraryService

Install components to KiCad libraries.

```typescript
import { createLibraryService } from '@jlcpcb/core';

const lib = createLibraryService();

// Install component to global library
const globalResult = await lib.install('C2040', {
  include3d: true,
});

// Install to project-local library
const projectResult = await lib.install('C2040', {
  projectPath: '/path/to/kicad/project',
  include3d: true,
});

// List installed components
const installed = await lib.listInstalled();

// Check library status
const status = await lib.getStatus();
console.log(status.version, status.paths.symLibTable);

// Initialize/register global library tables
await lib.ensureGlobalTables();
```

**InstallOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectPath` | `string` | - | Project path for local install |
| `include3d` | `boolean` | `true` | Download 3D model when available |
| `force` | `boolean` | `false` | Regenerate if exists |

**InstallResult:**

```typescript
import type { InstallResult } from '@jlcpcb/core';

const result: InstallResult = await lib.install('C2040');
console.log(result.symbolRef);             // Library-qualified symbol reference
console.log(result.footprintRef);          // Library-qualified footprint reference
console.log(result.files.symbolLibrary);  // Absolute .kicad_sym path
console.log(result.files.footprint);       // Generated .kicad_mod path, if needed
console.log(result.files.model3d);         // Downloaded model path, if available
console.log(result.footprintType);         // "reference" or "generated"
console.log(result.symbolAction);          // "created", "appended", "exists", or "replaced"
console.log(result.validationData.checks.pin_pad_count_match);
```

`listInstalled({ projectPath })` returns the same library-qualified symbol references as installation. Removing a component preserves unrelated symbols and any generated footprint still referenced by another installed symbol.

`getLibraryPaths(projectPath?)` resolves the shared library directories for a project or the detected global KiCad installation. Project-local model references use `${KIPRJMOD}`; global references use the detected version's variable, available through `getKicadThirdPartyVariable(version?)`.

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

Source-based symbols preserve separate SVG contours, relative/repeated path commands, Bézier curves, elliptical arcs, and unequal ellipses. Flattened curves stay within 0.005 mm after coordinate rounding. Source fills use KiCad outline fill; nested or overlapping filled subpaths fail when their hole/overlap semantics cannot be preserved. Visible Reference/Value properties follow the source pin bounds, including drawings far from the document origin. Standardized passive templates remain intentional transformations, not geometric copies of the source.

`compareSymbols()` validates pin numbers, names, relative connection positions, directions, and declared electrical types. KiCad coordinates are already millimetres; source coordinates use 0.254 mm units. One global translation is ignored, but scaling, rotation, renumbering, and relative movement are not. Position tolerance is capped at 0.05 mm and direction tolerance is 1°. Missing/duplicate identities and unknown metadata fail; an omitted source direction requires an unambiguous straight connection path. Explicit connector pinpart labels such as `J1/T+` resolve names consistently with source parsing.

The result's `coverage` explicitly excludes body graphics, text, pin lengths, and pin styles. `ignorePinNames: true` excludes name comparison and is disclosed in coverage; it does not relax electrical or geometric checks. Standardized passive geometry/electrical changes therefore fail strict source comparison. Live fixtures record exact expected discrepancies for those templates and for incomplete/ambiguous source metadata; those expectations do not turn CLI validation failures into passes.

#### FootprintConverter

```typescript
import { footprintConverter } from '@jlcpcb/core';

// Generate KiCad footprint file
const kicadMod = footprintConverter.convert(componentData, {
  include3DModel: true,
  modelPath: '${KICAD9_3RD_PARTY}/jlc_mcp/3dmodels/...',
});

// Get footprint (returns reference for built-in or generates custom)
const result = footprintConverter.getFootprint(componentData);
// { type: 'reference', reference: 'Resistor_SMD:R_0603_1608Metric', name: 'R_0603_1608Metric' }
// or, for ICs and other non-interchangeable packages:
// { type: 'generated', content: '(footprint ...)', name: '...' }
```

`convert()` preserves the source land pattern. `getFootprint()` may instead select a **nominal KiCad land pattern** for a recognized, unpolarized two-terminal R/C/L package with compatible pad identities and simple geometry. That substitution is intentional; it is not a claim that the source and standard pad dimensions are identical. ICs, connectors, polarized devices, unusual pads, and footprints with additional manufacturing features are generated.

Generated polygon pads have zero-width filled boundaries, without adding copper around their outlines. Slots retain their explicit diameter, total length, axis, and offset; explicit non-plated pads remain NPTH. Missing drill diameters, ambiguous slot axes, or contradictory slot dimensions cause conversion errors rather than guessed geometry.

Region paths support absolute/relative and repeated SVG commands, including Bézier and elliptical curves. Curves are flattened with a 0.005 mm chord-error bound before coordinate rounding. Courtyards enclose transformed pads, drills, and supported body/graphic geometry with at least 0.25 mm clearance.

Copper-pour cutouts become pour-only rule areas, while physical board cutouts become `Edge.Cuts`. Named-net exclusions and compound regions with nested or overlapping contours are rejected when their semantics cannot be preserved. These checks establish source fidelity, not datasheet compliance or board-level DRC.

Footprint comparison validates copper boundaries, layers, plating, full drill geometry, holes, and vias. Missing manufacturing metadata or unsupported reference geometry fails as unverified. Footprint position tolerance is capped at 0.05 mm and full-dimension tolerance at 0.02 mm; legacy warning-only or permissive tolerance options cannot bypass those checks.

Existing installed symbols and footprints are not rewritten automatically. Regenerate them explicitly to apply the corrected conversion.

#### Browser SVG previews

`renderSymbolSvg()` and `renderFootprintSvg()` render capsule pads/drills, transformed custom copper primitives, rotated drill offsets, roundrect radii, major/minor arcs, visible text/properties, and symbol fill/display metadata. Unsupported footprint primitives/shapes produce an explicit preview error rather than substitute copper.

Text uses browser fonts rather than KiCad stroke-font outlines. Rule areas are annotated outlines/shading, not copper subtraction. Preview rendering and pin comparison are not datasheet verification, ERC, or board-level DRC; inspect the generated files in native KiCad for those checks.

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

#### Footprint Mapping

Map complete passive package identities to nominal KiCad library entries. Use `getFootprint()` when selecting a footprint for an actual component: it also checks source geometry and pad identities.

```typescript
import { mapToKicadFootprint, getKicadFootprintRef, isStandardPassive } from '@jlcpcb/core';

const mapping = mapToKicadFootprint('R0603', 'R?');
if (mapping) {
  console.log(getKicadFootprintRef(mapping));
  // 'Resistor_SMD:R_0603_1608Metric'
}

isStandardPassive('C_0402_1005Metric', 'C?'); // true
mapToKicadFootprint('SOIC-8', 'U?');          // null: generate from source
mapToKicadFootprint('LED0805-RD', 'D?');      // null: not a chip-passive identity
```

Supported imperial sizes are 0201, 0402, 0603, 0805, 1206, 1210, and 1812 for R/C/L, plus 2010 and 2512 for R/L. Optional metric dimensions must agree with the imperial size. A trailing `?` in a component prefix is accepted; arbitrary size substrings and polarized-device descriptions are not.

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
